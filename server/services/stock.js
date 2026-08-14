import ApiError from '../utils/ApiError.js';

/**
 * Available stock is an aggregate over a view, so it cannot be locked with SELECT … FOR
 * UPDATE. Without a lock, two concurrent transfers of 60 read the same balance of 100, both
 * pass, and the base lands at −20. A transaction-scoped advisory lock serialises only the
 * writers touching this one bucket and releases on COMMIT or ROLLBACK.
 */
async function lockStock(client, baseId, equipmentTypeId) {
  await client.query('SELECT pg_advisory_xact_lock($1, $2)', [baseId, equipmentTypeId]);
}

async function getAvailableQuantity(client, baseId, equipmentTypeId) {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(delta), 0)::int AS quantity
       FROM asset_ledger
      WHERE base_id = $1 AND equipment_type_id = $2`,
    [baseId, equipmentTypeId],
  );
  return rows[0]?.quantity ?? 0;
}

/** Guards every path that removes stock: transfers, assignments, expenditures. */
export async function assertSufficientStock(client, baseId, equipmentTypeId, quantity) {
  await lockStock(client, baseId, equipmentTypeId);
  const available = await getAvailableQuantity(client, baseId, equipmentTypeId);

  if (available < quantity) {
    throw ApiError.conflict(
      `Insufficient stock: base has ${available} unit(s) available but ${quantity} were requested.`,
      { available, requested: quantity },
    );
  }
  return available;
}

/** Catches a bad id before the foreign key does, so the client gets a useful message. */
export async function assertReferenceExists(client, table, id, label) {
  const allowed = { bases: 'bases', equipment_types: 'equipment_types' };
  if (!allowed[table]) throw new Error(`Unsupported reference table: ${table}`);

  const { rowCount } = await client.query(`SELECT 1 FROM ${allowed[table]} WHERE id = $1`, [id]);
  if (rowCount === 0) throw ApiError.notFound(`${label} #${id} does not exist.`);
}
