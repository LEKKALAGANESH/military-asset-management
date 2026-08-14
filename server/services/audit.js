import { clientIp } from '../middlewares/loggerMiddleware.js';

/**
 * `executor` is the transaction client of the mutation being logged, never the pool: the
 * audit row must commit or roll back with the change it describes. A trail that can disagree
 * with the data is worse than none.
 */
export function recordAudit(executor, { req, action, entity, entityId, details }) {
  return executor.query(
    `INSERT INTO audit_logs (user_id, username, action, entity, entity_id, details, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      req.user?.id ?? null,
      req.user?.username ?? null,
      action,
      entity,
      entityId ?? null,
      details,
      clientIp(req),
    ],
  );
}
