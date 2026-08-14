import { query, withTransaction } from '../config/db.js';
import { assertBaseAccess } from '../middlewares/rbacMiddleware.js';
import { recordAudit } from '../services/audit.js';
import { assertReferenceExists, assertSufficientStock } from '../services/stock.js';
import ApiError from '../utils/ApiError.js';
import { asDate, asInt, asPagination, asString } from '../utils/validate.js';

/** GET /api/transfers — a base sees a transfer at either end of it. */
export async function listTransfers(req, res) {
  const equipmentTypeId = asInt(req.query.equipmentTypeId, 'equipmentTypeId', { required: false, min: 1 });
  const startDate = req.query.startDate ? asDate(req.query.startDate, 'startDate') : null;
  const endDate = req.query.endDate ? asDate(req.query.endDate, 'endDate', { endOfDay: true }) : null;
  const { limit, offset } = asPagination(req.query);

  const { rows } = await query(
    `SELECT t.id, t.quantity, t.status, t.notes, t.occurred_at, t.created_at,
            t.source_base_id,      sb.name AS source_base_name,
            t.destination_base_id, db.name AS destination_base_name,
            t.equipment_type_id,   e.name  AS equipment_name, e.category, e.unit,
            u.username AS initiated_by
       FROM transfers t
       JOIN bases           sb ON sb.id = t.source_base_id
       JOIN bases           db ON db.id = t.destination_base_id
       JOIN equipment_types e  ON e.id  = t.equipment_type_id
       LEFT JOIN users      u  ON u.id  = t.initiated_by
      WHERE ($1::int IS NULL OR t.source_base_id = $1 OR t.destination_base_id = $1)
        AND ($2::int IS NULL OR t.equipment_type_id = $2)
        AND ($3::timestamptz IS NULL OR t.occurred_at >= $3)
        AND ($4::timestamptz IS NULL OR t.occurred_at <= $4)
      ORDER BY t.occurred_at DESC, t.id DESC
      LIMIT $5 OFFSET $6`,
    [req.scope.baseId, equipmentTypeId, startDate, endDate, limit, offset],
  );

  // Relative to the viewer, so a scoped list reads at a glance.
  const data = rows.map((row) => ({
    ...row,
    direction: req.scope.baseId === null
      ? 'INTERNAL'
      : row.source_base_id === req.scope.baseId ? 'OUT' : 'IN',
  }));

  res.json({ data, pagination: { limit, offset, count: rows.length } });
}

/**
 * POST /api/transfers — the stock check, the insert and the audit row run in one
 * transaction. Any failure rolls back to exactly the prior state: no half-moved assets, no
 * audit record for a transfer that never happened.
 */
export async function createTransfer(req, res) {
  const sourceBaseId = asInt(req.body?.sourceBaseId, 'sourceBaseId', { min: 1 });
  const destinationBaseId = asInt(req.body?.destinationBaseId, 'destinationBaseId', { min: 1 });
  const equipmentTypeId = asInt(req.body?.equipmentTypeId, 'equipmentTypeId', { min: 1 });
  const quantity = asInt(req.body?.quantity, 'quantity', { min: 1, max: 1_000_000 });
  const notes = asString(req.body?.notes, 'notes', { required: false, max: 500 });
  const occurredAt = req.body?.occurredAt ? asDate(req.body.occurredAt, 'occurredAt') : new Date();

  if (sourceBaseId === destinationBaseId) {
    throw ApiError.badRequest('Source and destination base must be different.');
  }

  // Stock leaves the source base, so that is the base the caller must be authorised for.
  assertBaseAccess(req.user, sourceBaseId, 'source base');

  const transfer = await withTransaction(async (client) => {
    await assertReferenceExists(client, 'bases', sourceBaseId, 'Source base');
    await assertReferenceExists(client, 'bases', destinationBaseId, 'Destination base');
    await assertReferenceExists(client, 'equipment_types', equipmentTypeId, 'Equipment type');

    // Only the source is locked: the destination only gains stock, so it cannot go
    // negative, and one lock cannot deadlock against a transfer running the other way.
    await assertSufficientStock(client, sourceBaseId, equipmentTypeId, quantity);

    const { rows } = await client.query(
      `INSERT INTO transfers
         (source_base_id, destination_base_id, equipment_type_id, quantity, status, notes, occurred_at, initiated_by)
       VALUES ($1, $2, $3, $4, 'COMPLETED', $5, $6, $7)
       RETURNING *`,
      [sourceBaseId, destinationBaseId, equipmentTypeId, quantity, notes, occurredAt, req.user.id],
    );

    await recordAudit(client, {
      req,
      action: 'TRANSFER',
      entity: 'TRANSFER',
      entityId: rows[0].id,
      details: `Transferred ${quantity} unit(s) of equipment type #${equipmentTypeId} `
        + `from base #${sourceBaseId} to base #${destinationBaseId}`,
    });

    return rows[0];
  });

  res.status(201).json({ message: 'Transfer completed successfully.', data: transfer });
}

/** GET /api/transfers/:id */
export async function getTransfer(req, res) {
  const id = asInt(req.params.id, 'id', { min: 1 });

  const { rows } = await query(
    `SELECT t.*, sb.name AS source_base_name, db.name AS destination_base_name,
            e.name AS equipment_name, u.username AS initiated_by_username
       FROM transfers t
       JOIN bases           sb ON sb.id = t.source_base_id
       JOIN bases           db ON db.id = t.destination_base_id
       JOIN equipment_types e  ON e.id  = t.equipment_type_id
       LEFT JOIN users      u  ON u.id  = t.initiated_by
      WHERE t.id = $1`,
    [id],
  );

  const transfer = rows[0];
  if (!transfer) throw ApiError.notFound(`Transfer #${id} does not exist.`);

  // A scoped user may only open a transfer their base took part in.
  if (req.scope.baseId !== null
      && transfer.source_base_id !== req.scope.baseId
      && transfer.destination_base_id !== req.scope.baseId) {
    throw ApiError.forbidden('Access Denied: this transfer does not involve your base.');
  }

  res.json({ data: transfer });
}
