import { query, withTransaction } from '../config/db.js';
import { assertBaseAccess } from '../middlewares/rbacMiddleware.js';
import { recordAudit } from '../services/audit.js';
import { assertReferenceExists } from '../services/stock.js';
import { asDate, asDecimal, asInt, asPagination, asString } from '../utils/validate.js';

/** GET /api/purchases - scoped from `req.scope`, whatever the client asks for. */
export async function listPurchases(req, res) {
  const equipmentTypeId = asInt(req.query.equipmentTypeId, 'equipmentTypeId', { required: false, min: 1 });
  const startDate = req.query.startDate ? asDate(req.query.startDate, 'startDate') : null;
  const endDate = req.query.endDate ? asDate(req.query.endDate, 'endDate', { endOfDay: true }) : null;
  const { limit, offset } = asPagination(req.query);

  const { rows } = await query(
    `SELECT p.id, p.quantity, p.unit_cost, p.supplier, p.occurred_at, p.created_at,
            p.base_id, b.name AS base_name,
            p.equipment_type_id, e.name AS equipment_name, e.category, e.unit,
            u.username AS created_by
       FROM purchases p
       JOIN bases           b ON b.id = p.base_id
       JOIN equipment_types e ON e.id = p.equipment_type_id
       LEFT JOIN users      u ON u.id = p.created_by
      WHERE ($1::int IS NULL OR p.base_id = $1)
        AND ($2::int IS NULL OR p.equipment_type_id = $2)
        AND ($3::timestamptz IS NULL OR p.occurred_at >= $3)
        AND ($4::timestamptz IS NULL OR p.occurred_at <= $4)
      ORDER BY p.occurred_at DESC, p.id DESC
      LIMIT $5 OFFSET $6`,
    [req.scope.baseId, equipmentTypeId, startDate, endDate, limit, offset],
  );

  res.json({ data: rows, pagination: { limit, offset, count: rows.length } });
}

/** POST /api/purchases — the only movement needing no stock check: it can only add. */
export async function createPurchase(req, res) {
  const baseId = asInt(req.body?.baseId, 'baseId', { min: 1 });
  const equipmentTypeId = asInt(req.body?.equipmentTypeId, 'equipmentTypeId', { min: 1 });
  const quantity = asInt(req.body?.quantity, 'quantity', { min: 1, max: 1_000_000 });
  const unitCost = asDecimal(req.body?.unitCost, 'unitCost', { required: false, min: 0 });
  const supplier = asString(req.body?.supplier, 'supplier', { required: false, max: 150 });
  const occurredAt = req.body?.occurredAt ? asDate(req.body.occurredAt, 'occurredAt') : new Date();

  // Authenticated is not authorised: confirm this user may write to this base.
  assertBaseAccess(req.user, baseId);

  const purchase = await withTransaction(async (client) => {
    await assertReferenceExists(client, 'bases', baseId, 'Base');
    await assertReferenceExists(client, 'equipment_types', equipmentTypeId, 'Equipment type');

    const { rows } = await client.query(
      `INSERT INTO purchases (base_id, equipment_type_id, quantity, unit_cost, supplier, occurred_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [baseId, equipmentTypeId, quantity, unitCost, supplier, occurredAt, req.user.id],
    );

    await recordAudit(client, {
      req,
      action: 'PURCHASE',
      entity: 'PURCHASE',
      entityId: rows[0].id,
      details: `Purchased ${quantity} unit(s) of equipment type #${equipmentTypeId} for base #${baseId}`
        + (supplier ? ` from ${supplier}` : ''),
    });

    return rows[0];
  });

  res.status(201).json({ message: 'Purchase recorded successfully.', data: purchase });
}
