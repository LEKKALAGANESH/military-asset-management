import { query } from '../config/db.js';
import { computeBalances, MOVEMENT_TYPES } from '../services/balance.js';
import ApiError from '../utils/ApiError.js';
import { asDate, asEnum, asInt, asPagination } from '../utils/validate.js';

const DEFAULT_WINDOW_DAYS = 30;

/**
 * `baseId` comes from `req.scope`, already narrowed by enforceBaseScope, never from the raw
 * query string - so a Base Commander cannot widen their view by editing the URL.
 */
function resolveFilters(req) {
  const equipmentTypeId = asInt(req.query.equipmentTypeId, 'equipmentTypeId', { required: false, min: 1 });
  const endDate = req.query.endDate
    ? asDate(req.query.endDate, 'endDate', { endOfDay: true })
    : new Date();
  const startDate = req.query.startDate
    ? asDate(req.query.startDate, 'startDate')
    : new Date(endDate.getTime() - DEFAULT_WINDOW_DAYS * 86_400_000);

  if (startDate > endDate) throw ApiError.badRequest('"startDate" must not be after "endDate".');

  return { baseId: req.scope.baseId, equipmentTypeId, startDate, endDate };
}

/**
 * GET /api/assets/metrics - one pass over the ledger gives both sides of the equation:
 * everything before the window (opening) and everything inside it, split by movement type.
 */
export async function getDashboardMetrics(req, res) {
  const { baseId, equipmentTypeId, startDate, endDate } = resolveFilters(req);

  const { rows } = await query(
    `SELECT movement_type,
            COALESCE(SUM(delta) FILTER (WHERE occurred_at <  $3), 0)::int AS opening_delta,
            COALESCE(SUM(delta) FILTER (WHERE occurred_at >= $3
                                          AND occurred_at <= $4), 0)::int AS period_delta
       FROM asset_ledger
      WHERE ($1::int IS NULL OR base_id = $1)
        AND ($2::int IS NULL OR equipment_type_id = $2)
      GROUP BY movement_type`,
    [baseId, equipmentTypeId, startDate, endDate],
  );

  res.json({
    filters: {
      baseId,
      equipmentTypeId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      scope: req.scope.isGlobal ? 'ALL_BASES' : `BASE_${baseId}`,
    },
    metrics: computeBalances(rows),
  });
}

/** GET /api/assets/balances — same window, per equipment type. Powers the chart. */
export async function getBalancesByEquipment(req, res) {
  const { baseId, equipmentTypeId, startDate, endDate } = resolveFilters(req);

  const { rows } = await query(
    `SELECT l.equipment_type_id,
            e.name     AS equipment_name,
            e.category,
            e.unit,
            l.movement_type,
            COALESCE(SUM(l.delta) FILTER (WHERE l.occurred_at <  $3), 0)::int AS opening_delta,
            COALESCE(SUM(l.delta) FILTER (WHERE l.occurred_at >= $3
                                            AND l.occurred_at <= $4), 0)::int AS period_delta
       FROM asset_ledger l
       JOIN equipment_types e ON e.id = l.equipment_type_id
      WHERE ($1::int IS NULL OR l.base_id = $1)
        AND ($2::int IS NULL OR l.equipment_type_id = $2)
      GROUP BY l.equipment_type_id, e.name, e.category, e.unit, l.movement_type
      ORDER BY e.name`,
    [baseId, equipmentTypeId, startDate, endDate],
  );

  // Regroup the flat equipment × movement-type grid, reusing the same arithmetic.
  const byEquipment = new Map();
  for (const row of rows) {
    if (!byEquipment.has(row.equipment_type_id)) {
      byEquipment.set(row.equipment_type_id, {
        equipmentTypeId: row.equipment_type_id,
        equipmentName: row.equipment_name,
        category: row.category,
        unit: row.unit,
        rows: [],
      });
    }
    byEquipment.get(row.equipment_type_id).rows.push(row);
  }

  const data = [...byEquipment.values()].map(({ rows: movementRows, ...equipment }) => ({
    ...equipment,
    ...computeBalances(movementRows),
  }));

  res.json({ data });
}

/** GET /api/assets/movements - purchases, transfers, assignments and expenditures in one list. */
export async function getMovements(req, res) {
  const { baseId, equipmentTypeId, startDate, endDate } = resolveFilters(req);
  const { limit, offset } = asPagination(req.query);
  const movementType = asEnum(req.query.movementType, 'movementType', MOVEMENT_TYPES, { required: false });

  const { rows } = await query(
    `SELECT l.id, l.movement_type, l.delta, l.occurred_at,
            l.base_id, b.name AS base_name,
            l.equipment_type_id, e.name AS equipment_name, e.category,
            u.username AS actor
       FROM asset_ledger l
       JOIN bases           b ON b.id = l.base_id
       JOIN equipment_types e ON e.id = l.equipment_type_id
       LEFT JOIN users      u ON u.id = l.actor_id
      WHERE ($1::int IS NULL OR l.base_id = $1)
        AND ($2::int IS NULL OR l.equipment_type_id = $2)
        AND l.occurred_at >= $3 AND l.occurred_at <= $4
        AND ($5::varchar IS NULL OR l.movement_type = $5)
      ORDER BY l.occurred_at DESC, l.id DESC
      LIMIT $6 OFFSET $7`,
    [baseId, equipmentTypeId, startDate, endDate, movementType, limit, offset],
  );

  res.json({ data: rows, pagination: { limit, offset, count: rows.length } });
}

/**
 * GET /api/assets/stock — current holdings from the `assets` view, ignoring the date window.
 * The transfer form checks against this before letting stock leave.
 */
export async function getCurrentStock(req, res) {
  const equipmentTypeId = asInt(req.query.equipmentTypeId, 'equipmentTypeId', { required: false, min: 1 });

  const { rows } = await query(
    `SELECT base_id, base_name, equipment_type_id, equipment_name, category, unit,
            quantity, last_movement_at
       FROM assets
      WHERE ($1::int IS NULL OR base_id = $1)
        AND ($2::int IS NULL OR equipment_type_id = $2)
      ORDER BY base_name, equipment_name`,
    [req.scope.baseId, equipmentTypeId],
  );

  res.json({ data: rows });
}
