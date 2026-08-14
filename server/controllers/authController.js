import bcrypt from 'bcryptjs';
import { query, withTransaction } from '../config/db.js';
import { signToken } from '../middlewares/authMiddleware.js';
import { ROLES } from '../middlewares/rbacMiddleware.js';
import { recordAudit } from '../services/audit.js';
import ApiError from '../utils/ApiError.js';
import { asEnum, asInt, asString } from '../utils/validate.js';

const BCRYPT_ROUNDS = 12;
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

const publicUser = (row) => ({
  id: row.id,
  username: row.username,
  fullName: row.full_name,
  role: row.role,
  baseId: row.base_id,
  baseName: row.base_name ?? null,
});

/** POST /api/auth/login */
export async function login(req, res) {
  const username = asString(req.body?.username, 'username', { max: 50 });
  const password = asString(req.body?.password, 'password', { min: 1, max: 200 });

  const { rows } = await query(
    `SELECT u.*, b.name AS base_name
       FROM users u
       LEFT JOIN bases b ON b.id = u.base_id
      WHERE u.username = $1`,
    [username],
  );
  const user = rows[0];

  // Compare even when the user is unknown, so timing does not reveal registered usernames.
  const hash = user?.password_hash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi';
  const passwordMatches = await bcrypt.compare(password, hash);

  if (!user || !passwordMatches || !user.is_active) {
    await query(
      `INSERT INTO audit_logs (user_id, username, action, entity, details)
       VALUES ($1, $2, 'LOGIN_FAILED', 'USER', $3)`,
      [user?.id ?? null, username, `Failed sign-in attempt for "${username}"`],
    ).catch(() => {});
    throw ApiError.unauthorized('Invalid username or password.');
  }

  await query(
    `INSERT INTO audit_logs (user_id, username, action, entity, entity_id, details)
     VALUES ($1, $2, 'LOGIN', 'USER', $3, $4)`,
    [user.id, user.username, user.id, `${user.username} signed in as ${user.role}`],
  );

  res.json({ token: signToken(user), user: publicUser(user) });
}

/** GET /api/auth/me — re-read, so a role or base change applies without a new sign-in. */
export async function me(req, res) {
  const { rows } = await query(
    `SELECT u.id, u.username, u.full_name, u.role, u.base_id, u.is_active, b.name AS base_name
       FROM users u
       LEFT JOIN bases b ON b.id = u.base_id
      WHERE u.id = $1`,
    [req.user.id],
  );
  if (!rows[0] || !rows[0].is_active) throw ApiError.unauthorized('Account is no longer active.');
  res.json({ user: publicUser(rows[0]) });
}

/** POST /api/auth/register — Admin only. */
export async function register(req, res) {
  const username = asString(req.body?.username, 'username', { min: 3, max: 50, pattern: USERNAME_PATTERN });
  const password = asString(req.body?.password, 'password', { min: 8, max: 200 });
  const fullName = asString(req.body?.fullName, 'fullName', { min: 2, max: 100 });
  const role = asEnum(req.body?.role, 'role', Object.values(ROLES));
  const baseId = asInt(req.body?.baseId, 'baseId', { required: role !== ROLES.ADMIN, min: 1 });

  if (role !== ROLES.ADMIN && baseId === null) {
    throw ApiError.badRequest('A non-admin user must be assigned to a base.');
  }

  const created = await withTransaction(async (client) => {
    const { rowCount } = await client.query('SELECT 1 FROM users WHERE username = $1', [username]);
    if (rowCount > 0) throw ApiError.conflict(`Username "${username}" is already taken.`);

    if (baseId !== null) {
      const base = await client.query('SELECT 1 FROM bases WHERE id = $1', [baseId]);
      if (base.rowCount === 0) throw ApiError.notFound(`Base #${baseId} does not exist.`);
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const { rows } = await client.query(
      `INSERT INTO users (username, password_hash, full_name, role, base_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, full_name, role, base_id`,
      [username, passwordHash, fullName, role, baseId],
    );

    await recordAudit(client, {
      req,
      action: 'USER_CREATED',
      entity: 'USER',
      entityId: rows[0].id,
      details: `Created ${role} "${username}"${baseId ? ` at base #${baseId}` : ' (global)'}`,
    });

    return rows[0];
  });

  res.status(201).json({ user: publicUser(created) });
}

/** GET /api/auth/users — Admin only. Hashes never leave the database. */
export async function listUsers(_req, res) {
  const { rows } = await query(
    `SELECT u.id, u.username, u.full_name, u.role, u.base_id, u.is_active, b.name AS base_name
       FROM users u
       LEFT JOIN bases b ON b.id = u.base_id
      ORDER BY u.id`,
  );
  res.json({ data: rows.map(publicUser) });
}
