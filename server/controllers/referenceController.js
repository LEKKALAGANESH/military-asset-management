import { query, withTransaction } from '../config/db.js';
import { isGlobalRole } from '../middlewares/rbacMiddleware.js';
import { recordAudit } from '../services/audit.js';
import { asEnum, asString } from '../utils/validate.js';

const CATEGORIES = ['WEAPON', 'VEHICLE', 'AMMUNITION', 'EQUIPMENT'];

/**
 * A scoped user still sees every base *name* — a transfer needs somewhere to go — but only
 * their own base's data anywhere else.
 */
export async function listBases(_req, res) {
  const { rows } = await query('SELECT id, name, location FROM bases ORDER BY name');
  res.json({ data: rows });
}

/** POST /api/bases — Admin only. */
export async function createBase(req, res) {
  const name = asString(req.body?.name, 'name', { min: 2, max: 100 });
  const location = asString(req.body?.location, 'location', { min: 2, max: 150 });

  const base = await withTransaction(async (client) => {
    const { rows } = await client.query(
      'INSERT INTO bases (name, location) VALUES ($1, $2) RETURNING id, name, location',
      [name, location],
    );
    await recordAudit(client, {
      req,
      action: 'BASE_CREATED',
      entity: 'BASE',
      entityId: rows[0].id,
      details: `Created base "${name}" at ${location}`,
    });
    return rows[0];
  });

  res.status(201).json({ message: 'Base created successfully.', data: base });
}

/** GET /api/equipment-types */
export async function listEquipmentTypes(req, res) {
  const category = asEnum(req.query.category, 'category', CATEGORIES, { required: false });
  const { rows } = await query(
    `SELECT id, name, category, unit
       FROM equipment_types
      WHERE ($1::varchar IS NULL OR category = $1)
      ORDER BY category, name`,
    [category],
  );
  res.json({ data: rows });
}

/** POST /api/equipment-types — Admin only. */
export async function createEquipmentType(req, res) {
  const name = asString(req.body?.name, 'name', { min: 2, max: 100 });
  const category = asEnum(req.body?.category, 'category', CATEGORIES);
  const unit = asString(req.body?.unit, 'unit', { required: false, max: 20 }) || 'UNIT';

  const equipmentType = await withTransaction(async (client) => {
    const { rows } = await client.query(
      'INSERT INTO equipment_types (name, category, unit) VALUES ($1, $2, $3) RETURNING id, name, category, unit',
      [name, category, unit],
    );
    await recordAudit(client, {
      req,
      action: 'EQUIPMENT_TYPE_CREATED',
      entity: 'EQUIPMENT_TYPE',
      entityId: rows[0].id,
      details: `Created ${category} "${name}"`,
    });
    return rows[0];
  });

  res.status(201).json({ message: 'Equipment type created successfully.', data: equipmentType });
}

/** GET /api/meta — every dropdown the frontend needs, in one call. */
export async function getMetadata(req, res) {
  const [bases, equipmentTypes] = await Promise.all([
    query('SELECT id, name, location FROM bases ORDER BY name'),
    query('SELECT id, name, category, unit FROM equipment_types ORDER BY category, name'),
  ]);

  res.json({
    bases: bases.rows,
    equipmentTypes: equipmentTypes.rows,
    categories: CATEGORIES,
    scope: { baseId: isGlobalRole(req.user) ? null : req.user.baseId, isGlobal: isGlobalRole(req.user) },
  });
}
