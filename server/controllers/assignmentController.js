import { query, withTransaction } from '../config/db.js';
import { assertBaseAccess } from '../middlewares/rbacMiddleware.js';
import { recordAudit } from '../services/audit.js';
import { assertReferenceExists, assertSufficientStock } from '../services/stock.js';
import { asDate, asInt, asPagination, asString } from '../utils/validate.js';

/**
 * Assignments and expenditures share a controller: the same operation with a different
 * reason. Both remove quantity from a base and both must be refused when it cannot cover it.
 */

/** GET /api/assignments */
export async function listAssignments(req, res) {
  const equipmentTypeId = asInt(req.query.equipmentTypeId, 'equipmentTypeId', { required: false, min: 1 });
  const startDate = req.query.startDate ? asDate(req.query.startDate, 'startDate') : null;
  const endDate = req.query.endDate ? asDate(req.query.endDate, 'endDate', { endOfDay: true }) : null;
  const { limit, offset } = asPagination(req.query);

  const { rows } = await query(
    `SELECT a.id, a.quantity, a.assigned_to, a.personnel_rank, a.purpose,
            a.occurred_at, a.created_at,
            a.base_id, b.name AS base_name,
            a.equipment_type_id, e.name AS equipment_name, e.category, e.unit,
            u.username AS created_by
       FROM assignments a
       JOIN bases           b ON b.id = a.base_id
       JOIN equipment_types e ON e.id = a.equipment_type_id
       LEFT JOIN users      u ON u.id = a.created_by
      WHERE ($1::int IS NULL OR a.base_id = $1)
        AND ($2::int IS NULL OR a.equipment_type_id = $2)
        AND ($3::timestamptz IS NULL OR a.occurred_at >= $3)
        AND ($4::timestamptz IS NULL OR a.occurred_at <= $4)
      ORDER BY a.occurred_at DESC, a.id DESC
      LIMIT $5 OFFSET $6`,
    [req.scope.baseId, equipmentTypeId, startDate, endDate, limit, offset],
  );

  res.json({ data: rows, pagination: { limit, offset, count: rows.length } });
}

/** POST /api/assignments — issues stock to a named member of personnel. */
export async function createAssignment(req, res) {
  const baseId = asInt(req.body?.baseId, 'baseId', { min: 1 });
  const equipmentTypeId = asInt(req.body?.equipmentTypeId, 'equipmentTypeId', { min: 1 });
  const quantity = asInt(req.body?.quantity, 'quantity', { min: 1, max: 1_000_000 });
  const assignedTo = asString(req.body?.assignedTo, 'assignedTo', { min: 2, max: 120 });
  const personnelRank = asString(req.body?.personnelRank, 'personnelRank', { required: false, max: 50 });
  const purpose = asString(req.body?.purpose, 'purpose', { required: false, max: 500 });
  const occurredAt = req.body?.occurredAt ? asDate(req.body.occurredAt, 'occurredAt') : new Date();

  assertBaseAccess(req.user, baseId);

  const assignment = await withTransaction(async (client) => {
    await assertReferenceExists(client, 'bases', baseId, 'Base');
    await assertReferenceExists(client, 'equipment_types', equipmentTypeId, 'Equipment type');
    await assertSufficientStock(client, baseId, equipmentTypeId, quantity);

    const { rows } = await client.query(
      `INSERT INTO assignments
         (base_id, equipment_type_id, quantity, assigned_to, personnel_rank, purpose, occurred_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [baseId, equipmentTypeId, quantity, assignedTo, personnelRank, purpose, occurredAt, req.user.id],
    );

    await recordAudit(client, {
      req,
      action: 'ASSIGNMENT',
      entity: 'ASSIGNMENT',
      entityId: rows[0].id,
      details: `Assigned ${quantity} unit(s) of equipment type #${equipmentTypeId} `
        + `at base #${baseId} to ${personnelRank ? `${personnelRank} ` : ''}${assignedTo}`,
    });

    return rows[0];
  });

  res.status(201).json({ message: 'Assignment recorded successfully.', data: assignment });
}

/** GET /api/expenditures */
export async function listExpenditures(req, res) {
  const equipmentTypeId = asInt(req.query.equipmentTypeId, 'equipmentTypeId', { required: false, min: 1 });
  const startDate = req.query.startDate ? asDate(req.query.startDate, 'startDate') : null;
  const endDate = req.query.endDate ? asDate(req.query.endDate, 'endDate', { endOfDay: true }) : null;
  const { limit, offset } = asPagination(req.query);

  const { rows } = await query(
    `SELECT x.id, x.quantity, x.reason, x.occurred_at, x.created_at,
            x.base_id, b.name AS base_name,
            x.equipment_type_id, e.name AS equipment_name, e.category, e.unit,
            u.username AS created_by
       FROM expenditures x
       JOIN bases           b ON b.id = x.base_id
       JOIN equipment_types e ON e.id = x.equipment_type_id
       LEFT JOIN users      u ON u.id = x.created_by
      WHERE ($1::int IS NULL OR x.base_id = $1)
        AND ($2::int IS NULL OR x.equipment_type_id = $2)
        AND ($3::timestamptz IS NULL OR x.occurred_at >= $3)
        AND ($4::timestamptz IS NULL OR x.occurred_at <= $4)
      ORDER BY x.occurred_at DESC, x.id DESC
      LIMIT $5 OFFSET $6`,
    [req.scope.baseId, equipmentTypeId, startDate, endDate, limit, offset],
  );

  res.json({ data: rows, pagination: { limit, offset, count: rows.length } });
}

/** POST /api/expenditures — stock consumed and gone: spent ammunition, write-offs. */
export async function createExpenditure(req, res) {
  const baseId = asInt(req.body?.baseId, 'baseId', { min: 1 });
  const equipmentTypeId = asInt(req.body?.equipmentTypeId, 'equipmentTypeId', { min: 1 });
  const quantity = asInt(req.body?.quantity, 'quantity', { min: 1, max: 1_000_000 });
  const reason = asString(req.body?.reason, 'reason', { min: 3, max: 200 });
  const occurredAt = req.body?.occurredAt ? asDate(req.body.occurredAt, 'occurredAt') : new Date();

  assertBaseAccess(req.user, baseId);

  const expenditure = await withTransaction(async (client) => {
    await assertReferenceExists(client, 'bases', baseId, 'Base');
    await assertReferenceExists(client, 'equipment_types', equipmentTypeId, 'Equipment type');
    await assertSufficientStock(client, baseId, equipmentTypeId, quantity);

    const { rows } = await client.query(
      `INSERT INTO expenditures (base_id, equipment_type_id, quantity, reason, occurred_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [baseId, equipmentTypeId, quantity, reason, occurredAt, req.user.id],
    );

    await recordAudit(client, {
      req,
      action: 'EXPENDITURE',
      entity: 'EXPENDITURE',
      entityId: rows[0].id,
      details: `Expended ${quantity} unit(s) of equipment type #${equipmentTypeId} `
        + `at base #${baseId} — ${reason}`,
    });

    return rows[0];
  });

  res.status(201).json({ message: 'Expenditure recorded successfully.', data: expenditure });
}
