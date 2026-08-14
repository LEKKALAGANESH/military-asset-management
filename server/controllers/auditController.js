import { query } from '../config/db.js';
import { asDate, asInt, asPagination, asString } from '../utils/validate.js';

/**
 * GET /api/audit-logs — Admin only. The trail is append-only: no update or delete endpoint
 * exists anywhere in the API, which is the point of it.
 */
export async function listAuditLogs(req, res) {
  const action = asString(req.query.action, 'action', { required: false, max: 50 });
  const userId = asInt(req.query.userId, 'userId', { required: false, min: 1 });
  const startDate = req.query.startDate ? asDate(req.query.startDate, 'startDate') : null;
  const endDate = req.query.endDate ? asDate(req.query.endDate, 'endDate', { endOfDay: true }) : null;
  const { limit, offset } = asPagination(req.query);

  const { rows } = await query(
    `SELECT a.id, a.user_id, COALESCE(a.username, u.username) AS username,
            a.action, a.entity, a.entity_id, a.details, a.ip_address, a.created_at,
            u.role AS user_role
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
      WHERE ($1::varchar IS NULL OR a.action = $1)
        AND ($2::int IS NULL OR a.user_id = $2)
        AND ($3::timestamptz IS NULL OR a.created_at >= $3)
        AND ($4::timestamptz IS NULL OR a.created_at <= $4)
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT $5 OFFSET $6`,
    [action ? action.toUpperCase() : null, userId, startDate, endDate, limit, offset],
  );

  res.json({ data: rows, pagination: { limit, offset, count: rows.length } });
}

/** GET /api/audit-logs/actions — distinct action values, for the filter dropdown. */
export async function listAuditActions(_req, res) {
  const { rows } = await query('SELECT DISTINCT action FROM audit_logs ORDER BY action');
  res.json({ data: rows.map((row) => row.action) });
}
