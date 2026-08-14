import { computeBalances, MOVEMENT_TYPES } from '../../server/services/balance.js';
import { buildSeed } from './demoData.js';

/**
 * The API, served from the browser instead of over HTTP.
 *
 * This build has no database and no server: an axios adapter answers every request from
 * localStorage, so the React app, its pages and its hooks are untouched and still speak the same
 * endpoints. Seeding happens on first load, which is what makes the demo work on a device that
 * has never opened it before.
 *
 * The ledger derivation below mirrors the `asset_ledger` view in server/db/schema.sql, and the
 * arithmetic is imported from the server rather than reimplemented, so both builds agree.
 *
 * What this cannot do is enforce anything. Role scoping here shapes the view; it is not a
 * security boundary, because every record and every password already sits in the browser. The
 * Postgres build under server/ remains the one that enforces.
 */

const STORAGE_KEY = 'mams.demo.v1';
const CATEGORIES = ['WEAPON', 'VEHICLE', 'AMMUNITION', 'EQUIPMENT'];
const DEFAULT_WINDOW_DAYS = 30;

function load() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    // Corrupt or unreadable: reseed rather than leave the app with nothing to show.
  }
  const seeded = buildSeed();
  save(seeded);
  return seeded;
}

function save(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

const nextId = (rows) => rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;

/** Mirrors the `asset_ledger` view: every movement normalised to a signed delta. */
function ledger(db) {
  return [
    ...db.purchases.map((row) => entry(row, row.base_id, 'PURCHASE', row.quantity, row.created_by)),
    ...db.transfers
      .filter((row) => row.status === 'COMPLETED')
      .flatMap((row) => [
        entry(row, row.destination_base_id, 'TRANSFER_IN', row.quantity, row.initiated_by),
        entry(row, row.source_base_id, 'TRANSFER_OUT', -row.quantity, row.initiated_by),
      ]),
    ...db.assignments.map((row) => entry(row, row.base_id, 'ASSIGNMENT', -row.quantity, row.created_by)),
    ...db.expenditures.map((row) => entry(row, row.base_id, 'EXPENDITURE', -row.quantity, row.created_by)),
  ];
}

const entry = (row, baseId, movementType, delta, actorId) => ({
  id: row.id,
  base_id: baseId,
  equipment_type_id: row.equipment_type_id,
  occurred_at: row.occurred_at,
  movement_type: movementType,
  delta,
  actor_id: actorId,
});

/** Current holdings per base per equipment type — the `assets` view, derived not stored. */
function stockFor(db, baseId, equipmentTypeId) {
  const totals = new Map();

  for (const row of ledger(db)) {
    if (baseId != null && row.base_id !== baseId) continue;
    if (equipmentTypeId != null && row.equipment_type_id !== equipmentTypeId) continue;

    const key = `${row.base_id}:${row.equipment_type_id}`;
    const held = totals.get(key) ?? { base_id: row.base_id, equipment_type_id: row.equipment_type_id, quantity: 0, last_movement_at: null };
    held.quantity += row.delta;
    if (!held.last_movement_at || row.occurred_at > held.last_movement_at) held.last_movement_at = row.occurred_at;
    totals.set(key, held);
  }

  const base = byId(db.bases);
  const equipment = byId(db.equipmentTypes);

  return [...totals.values()]
    .map((held) => ({
      ...held,
      base_name: base.get(held.base_id)?.name,
      equipment_name: equipment.get(held.equipment_type_id)?.name,
      category: equipment.get(held.equipment_type_id)?.category,
      unit: equipment.get(held.equipment_type_id)?.unit,
    }))
    .sort((a, b) => a.base_name.localeCompare(b.base_name) || a.equipment_name.localeCompare(b.equipment_name));
}

const byId = (rows) => new Map(rows.map((row) => [row.id, row]));

/** Groups the ledger the way the SQL `FILTER (WHERE ...)` aggregates do, for computeBalances. */
function movementTotals(entries, startDate, endDate) {
  const totals = new Map(MOVEMENT_TYPES.map((type) => [type, { movement_type: type, opening_delta: 0, period_delta: 0 }]));

  for (const row of entries) {
    const at = new Date(row.occurred_at);
    const total = totals.get(row.movement_type);
    if (at < startDate) total.opening_delta += row.delta;
    else if (at <= endDate) total.period_delta += row.delta;
  }

  return [...totals.values()];
}

function resolveWindow(params) {
  const endDate = params.endDate ? endOfDay(params.endDate) : new Date();
  const startDate = params.startDate
    ? new Date(params.startDate)
    : new Date(endDate.getTime() - DEFAULT_WINDOW_DAYS * 86_400_000);
  return { startDate, endDate };
}

function endOfDay(value) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

const int = (value) => (value === undefined || value === '' || value === null ? null : Number(value));

function paginate(rows, params) {
  const limit = Math.min(Number(params.limit) || 50, 200);
  const offset = Number(params.offset) || 0;
  const page = rows.slice(offset, offset + limit);
  return { page, pagination: { limit, offset, count: page.length } };
}

class DemoError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Marks a 201. A plain `{ status }` check would misfire on `/health`, whose body legitimately
 * carries a `status` field of its own.
 */
const created = (body) => ({ __created: body });

// ---- auth ----------------------------------------------------------------

const TOKEN_PREFIX = 'demo.';

function authenticate(db, config) {
  // AxiosHeaders exposes a getter; a plain object does not.
  const header = typeof config.headers?.get === 'function'
    ? config.headers.get('Authorization')
    : config.headers?.Authorization ?? config.headers?.authorization;
  const token = typeof header === 'string' ? header.replace(/^Bearer\s+/i, '') : '';
  const userId = token.startsWith(TOKEN_PREFIX) ? Number(token.slice(TOKEN_PREFIX.length)) : NaN;
  const user = db.users.find((row) => row.id === userId);

  if (!user) throw new DemoError(401, 'Missing bearer token.');
  return user;
}

/** An Admin sees every base; everyone else is pinned to their own, as the API does. */
function scopeFor(user, params = {}) {
  if (user.role !== 'ADMIN') return { baseId: user.base_id, isGlobal: false };
  const requested = params.baseId;
  const baseId = requested === undefined || requested === '' || requested === 'all' ? null : Number(requested);
  return { baseId, isGlobal: baseId === null };
}

const publicUser = (db, user) => ({
  id: user.id,
  username: user.username,
  fullName: user.full_name,
  role: user.role,
  baseId: user.base_id,
  baseName: user.base_id ? byId(db.bases).get(user.base_id)?.name ?? null : null,
});

function recordAudit(db, user, action, entity, entityId, details) {
  db.auditLogs.push({
    id: nextId(db.auditLogs),
    user_id: user?.id ?? null,
    username: user?.username ?? null,
    action,
    entity,
    entity_id: entityId,
    details,
    ip_address: null,
    created_at: new Date().toISOString(),
  });
}

// ---- movement records ----------------------------------------------------

/** Shared shape for the four movement tables, which differ only in their own columns. */
function decorate(db, rows, baseKey = 'base_id') {
  const base = byId(db.bases);
  const equipment = byId(db.equipmentTypes);
  const users = byId(db.users);

  return rows.map((row) => ({
    ...row,
    base_name: base.get(row[baseKey])?.name,
    equipment_name: equipment.get(row.equipment_type_id)?.name,
    category: equipment.get(row.equipment_type_id)?.category,
    unit: equipment.get(row.equipment_type_id)?.unit,
    created_by: users.get(row.created_by)?.username ?? null,
  }));
}

function filterMovements(rows, scope, params, baseKey = 'base_id') {
  const equipmentTypeId = int(params.equipmentTypeId);
  const start = params.startDate ? new Date(params.startDate) : null;
  const end = params.endDate ? endOfDay(params.endDate) : null;

  return rows
    .filter((row) => scope.baseId == null || row[baseKey] === scope.baseId)
    .filter((row) => equipmentTypeId == null || row.equipment_type_id === equipmentTypeId)
    .filter((row) => !start || new Date(row.occurred_at) >= start)
    .filter((row) => !end || new Date(row.occurred_at) <= end)
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || b.id - a.id);
}

/** Stock may not go negative — the guard the database enforces with a lock. */
function assertStock(db, baseId, equipmentTypeId, quantity) {
  const [held] = stockFor(db, baseId, equipmentTypeId);
  const available = held?.quantity ?? 0;
  if (quantity > available) {
    throw new DemoError(409, `Insufficient stock: ${available} available, ${quantity} requested.`);
  }
}

function requireFields(body, fields) {
  for (const field of fields) {
    if (body?.[field] === undefined || body[field] === null || body[field] === '') {
      throw new DemoError(400, `"${field}" is required.`);
    }
  }
}

/** Non-admins may only write against their own base, as enforceBaseOwnership does. */
function assertOwnership(user, baseId) {
  if (user.role === 'ADMIN') return;
  if (user.base_id == null || Number(baseId) !== Number(user.base_id)) {
    throw new DemoError(403, 'Access Denied: you are not authorised to act on this base.');
  }
}

// ---- routes --------------------------------------------------------------

const ROUTES = {
  'GET /health': () => ({ status: 'ok', database: 'browser', schema: 'ready', timestamp: new Date().toISOString() }),

  'POST /auth/login': (db, { body }) => {
    const user = db.users.find((row) => row.username === body?.username);
    if (!user || user.password !== body?.password) {
      recordAudit(db, null, 'LOGIN_FAILED', 'USER', null, `Failed sign-in attempt for "${body?.username ?? ''}"`);
      save(db);
      throw new DemoError(401, 'Invalid username or password.');
    }
    recordAudit(db, user, 'LOGIN', 'USER', user.id, `${user.username} signed in as ${user.role}`);
    save(db);
    return { token: `${TOKEN_PREFIX}${user.id}`, user: publicUser(db, user) };
  },

  'GET /auth/me': (db, { user }) => ({ user: publicUser(db, user) }),

  'GET /meta': (db, { user }) => ({
    bases: db.bases,
    equipmentTypes: db.equipmentTypes,
    categories: CATEGORIES,
    scope: { baseId: user.role === 'ADMIN' ? null : user.base_id, isGlobal: user.role === 'ADMIN' },
  }),

  'GET /assets/metrics': (db, { scope, params }) => {
    const { startDate, endDate } = resolveWindow(params);
    const equipmentTypeId = int(params.equipmentTypeId);
    const entries = ledger(db).filter((row) =>
      (scope.baseId == null || row.base_id === scope.baseId)
      && (equipmentTypeId == null || row.equipment_type_id === equipmentTypeId));

    return {
      filters: {
        baseId: scope.baseId,
        equipmentTypeId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        scope: scope.isGlobal ? 'ALL_BASES' : `BASE_${scope.baseId}`,
      },
      metrics: computeBalances(movementTotals(entries, startDate, endDate)),
    };
  },

  'GET /assets/balances': (db, { scope, params }) => {
    const { startDate, endDate } = resolveWindow(params);
    const equipmentTypeId = int(params.equipmentTypeId);
    const equipment = byId(db.equipmentTypes);

    const grouped = new Map();
    for (const row of ledger(db)) {
      if (scope.baseId != null && row.base_id !== scope.baseId) continue;
      if (equipmentTypeId != null && row.equipment_type_id !== equipmentTypeId) continue;
      const bucket = grouped.get(row.equipment_type_id) ?? [];
      bucket.push(row);
      grouped.set(row.equipment_type_id, bucket);
    }

    const data = [...grouped.entries()]
      .map(([typeId, entries]) => ({
        equipmentTypeId: typeId,
        equipmentName: equipment.get(typeId)?.name,
        category: equipment.get(typeId)?.category,
        unit: equipment.get(typeId)?.unit,
        ...computeBalances(movementTotals(entries, startDate, endDate)),
      }))
      .sort((a, b) => a.equipmentName.localeCompare(b.equipmentName));

    return { data };
  },

  'GET /assets/movements': (db, { scope, params }) => {
    const { startDate, endDate } = resolveWindow(params);
    const equipmentTypeId = int(params.equipmentTypeId);
    const base = byId(db.bases);
    const equipment = byId(db.equipmentTypes);
    const users = byId(db.users);

    const rows = ledger(db)
      .filter((row) => scope.baseId == null || row.base_id === scope.baseId)
      .filter((row) => equipmentTypeId == null || row.equipment_type_id === equipmentTypeId)
      .filter((row) => !params.movementType || row.movement_type === params.movementType)
      .filter((row) => {
        const at = new Date(row.occurred_at);
        return at >= startDate && at <= endDate;
      })
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || b.id - a.id)
      .map((row) => ({
        ...row,
        base_name: base.get(row.base_id)?.name,
        equipment_name: equipment.get(row.equipment_type_id)?.name,
        category: equipment.get(row.equipment_type_id)?.category,
        actor: users.get(row.actor_id)?.username ?? null,
      }));

    const { page, pagination } = paginate(rows, params);
    return { data: page, pagination };
  },

  'GET /assets/stock': (db, { scope, params }) => ({
    data: stockFor(db, scope.baseId, int(params.equipmentTypeId)),
  }),

  'GET /purchases': (db, { scope, params }) => {
    const rows = decorate(db, filterMovements(db.purchases, scope, params));
    const { page, pagination } = paginate(rows, params);
    return { data: page, pagination };
  },

  'POST /purchases': (db, { user, body }) => {
    requireFields(body, ['baseId', 'equipmentTypeId', 'quantity']);
    assertOwnership(user, body.baseId);

    const purchase = {
      id: nextId(db.purchases),
      base_id: Number(body.baseId),
      equipment_type_id: Number(body.equipmentTypeId),
      quantity: Number(body.quantity),
      unit_cost: body.unitCost === undefined || body.unitCost === '' ? null : Number(body.unitCost),
      supplier: body.supplier || null,
      occurred_at: new Date(body.occurredAt ?? Date.now()).toISOString(),
      created_at: new Date().toISOString(),
      created_by: user.id,
    };

    db.purchases.push(purchase);
    recordAudit(db, user, 'PURCHASE_CREATED', 'PURCHASE', purchase.id, `Recorded ${purchase.quantity} units`);
    save(db);
    return created({ message: 'Purchase recorded successfully.', data: decorate(db, [purchase])[0] });
  },

  'GET /transfers': (db, { scope, params }) => {
    const base = byId(db.bases);
    const equipment = byId(db.equipmentTypes);
    const users = byId(db.users);
    const equipmentTypeId = int(params.equipmentTypeId);
    const start = params.startDate ? new Date(params.startDate) : null;
    const end = params.endDate ? endOfDay(params.endDate) : null;

    // A transfer belongs to both bases, so scope matches either side.
    const rows = db.transfers
      .filter((row) => scope.baseId == null || row.source_base_id === scope.baseId || row.destination_base_id === scope.baseId)
      .filter((row) => equipmentTypeId == null || row.equipment_type_id === equipmentTypeId)
      .filter((row) => !start || new Date(row.occurred_at) >= start)
      .filter((row) => !end || new Date(row.occurred_at) <= end)
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || b.id - a.id)
      .map((row) => ({
        ...row,
        source_base_name: base.get(row.source_base_id)?.name,
        destination_base_name: base.get(row.destination_base_id)?.name,
        equipment_name: equipment.get(row.equipment_type_id)?.name,
        category: equipment.get(row.equipment_type_id)?.category,
        unit: equipment.get(row.equipment_type_id)?.unit,
        initiated_by: users.get(row.initiated_by)?.username ?? null,
      }));

    const { page, pagination } = paginate(rows, params);
    return { data: page, pagination };
  },

  'POST /transfers': (db, { user, body }) => {
    requireFields(body, ['sourceBaseId', 'destinationBaseId', 'equipmentTypeId', 'quantity']);
    const sourceBaseId = Number(body.sourceBaseId);
    const destinationBaseId = Number(body.destinationBaseId);
    if (sourceBaseId === destinationBaseId) throw new DemoError(400, 'Source and destination must differ.');
    assertOwnership(user, sourceBaseId);
    assertStock(db, sourceBaseId, Number(body.equipmentTypeId), Number(body.quantity));

    const transfer = {
      id: nextId(db.transfers),
      source_base_id: sourceBaseId,
      destination_base_id: destinationBaseId,
      equipment_type_id: Number(body.equipmentTypeId),
      quantity: Number(body.quantity),
      status: 'COMPLETED',
      notes: body.notes || null,
      occurred_at: new Date(body.occurredAt ?? Date.now()).toISOString(),
      created_at: new Date().toISOString(),
      initiated_by: user.id,
    };

    db.transfers.push(transfer);
    recordAudit(db, user, 'TRANSFER_CREATED', 'TRANSFER', transfer.id, `Transferred ${transfer.quantity} units`);
    save(db);

    const base = byId(db.bases);
    return created({
      message: 'Transfer completed successfully.',
      data: {
          ...transfer,
        source_base_name: base.get(transfer.source_base_id)?.name,
        destination_base_name: base.get(transfer.destination_base_id)?.name,
        equipment_name: byId(db.equipmentTypes).get(transfer.equipment_type_id)?.name,
        initiated_by: user.username,
      },
    });
  },

  'GET /assignments': (db, { scope, params }) => {
    const rows = decorate(db, filterMovements(db.assignments, scope, params));
    const { page, pagination } = paginate(rows, params);
    return { data: page, pagination };
  },

  'POST /assignments': (db, { user, body }) => {
    requireFields(body, ['baseId', 'equipmentTypeId', 'quantity', 'assignedTo']);
    assertOwnership(user, body.baseId);
    assertStock(db, Number(body.baseId), Number(body.equipmentTypeId), Number(body.quantity));

    const assignment = {
      id: nextId(db.assignments),
      base_id: Number(body.baseId),
      equipment_type_id: Number(body.equipmentTypeId),
      quantity: Number(body.quantity),
      assigned_to: body.assignedTo,
      personnel_rank: body.personnelRank || null,
      purpose: body.purpose || null,
      occurred_at: new Date(body.occurredAt ?? Date.now()).toISOString(),
      created_at: new Date().toISOString(),
      created_by: user.id,
    };

    db.assignments.push(assignment);
    recordAudit(db, user, 'ASSIGNMENT_CREATED', 'ASSIGNMENT', assignment.id, `Assigned ${assignment.quantity} units to ${assignment.assigned_to}`);
    save(db);
    return created({ message: 'Assignment recorded successfully.', data: decorate(db, [assignment])[0] });
  },

  'GET /expenditures': (db, { scope, params }) => {
    const rows = decorate(db, filterMovements(db.expenditures, scope, params));
    const { page, pagination } = paginate(rows, params);
    return { data: page, pagination };
  },

  'POST /expenditures': (db, { user, body }) => {
    requireFields(body, ['baseId', 'equipmentTypeId', 'quantity', 'reason']);
    assertOwnership(user, body.baseId);
    assertStock(db, Number(body.baseId), Number(body.equipmentTypeId), Number(body.quantity));

    const expenditure = {
      id: nextId(db.expenditures),
      base_id: Number(body.baseId),
      equipment_type_id: Number(body.equipmentTypeId),
      quantity: Number(body.quantity),
      reason: body.reason,
      occurred_at: new Date(body.occurredAt ?? Date.now()).toISOString(),
      created_at: new Date().toISOString(),
      created_by: user.id,
    };

    db.expenditures.push(expenditure);
    recordAudit(db, user, 'EXPENDITURE_CREATED', 'EXPENDITURE', expenditure.id, `Expended ${expenditure.quantity} units: ${expenditure.reason}`);
    save(db);
    return created({ message: 'Expenditure recorded successfully.', data: decorate(db, [expenditure])[0] });
  },

  'GET /audit-logs': (db, { user, params }) => {
    if (user.role !== 'ADMIN') throw new DemoError(403, 'Access Denied: insufficient role.');

    const users = byId(db.users);
    const start = params.startDate ? new Date(params.startDate) : null;
    const end = params.endDate ? endOfDay(params.endDate) : null;

    const rows = db.auditLogs
      .filter((row) => !params.action || row.action === String(params.action).toUpperCase())
      .filter((row) => !params.userId || row.user_id === Number(params.userId))
      .filter((row) => !start || new Date(row.created_at) >= start)
      .filter((row) => !end || new Date(row.created_at) <= end)
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)
      .map((row) => ({ ...row, user_role: users.get(row.user_id)?.role ?? null }));

    const { page, pagination } = paginate(rows, params);
    return { data: page, pagination };
  },

  'GET /audit-logs/actions': (db, { user }) => {
    if (user.role !== 'ADMIN') throw new DemoError(403, 'Access Denied: insufficient role.');
    return { data: [...new Set(db.auditLogs.map((row) => row.action))].sort() };
  },
};

const PUBLIC_ROUTES = new Set(['GET /health', 'POST /auth/login']);

/**
 * An axios adapter, so no caller changes: axios hands us the request it would have sent and we
 * resolve the response it would have received. Errors reject in the shape the response
 * interceptor already understands.
 */
export default function demoAdapter(config) {
  const method = (config.method ?? 'get').toUpperCase();
  const path = (config.url ?? '').replace(/^\/api/, '').split('?')[0] || '/';
  const key = `${method} ${path}`;

  return new Promise((resolve, reject) => {
    const respond = (status, data) => resolve({ data, status, statusText: '', headers: {}, config, request: {} });

    try {
      const handler = ROUTES[key];
      if (!handler) throw new DemoError(404, `No route matches ${method} ${path}`);

      const db = load();
      const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      const params = config.params ?? {};
      const user = PUBLIC_ROUTES.has(key) ? null : authenticate(db, config);

      const result = handler(db, { user, scope: user ? scopeFor(user, params) : null, params, body });
      if (result && result.__created !== undefined) respond(201, result.__created);
      else respond(200, result);
    } catch (error) {
      const status = error instanceof DemoError ? error.status : 500;
      const message = error instanceof DemoError ? error.message : 'Internal server error.';
      reject(Object.assign(new Error(message), {
        config,
        response: { status, data: { error: message }, headers: {}, config },
      }));
    }
  });
}
