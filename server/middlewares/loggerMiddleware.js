import { randomUUID } from 'node:crypto';
import { query } from '../config/db.js';

/**
 * Mutations write their own audit row inside their transaction (services/audit.js), so it
 * can never survive a rolled-back change. What a controller cannot record is a request that
 * never reached it - this covers that gap by persisting rejected access attempts.
 */
export function requestLogger(req, res, next) {
  req.requestId = randomUUID();
  req.startedAt = Date.now();
  res.setHeader('X-Request-Id', req.requestId);

  res.on('finish', () => {
    const duration = Date.now() - req.startedAt;
    const actor = req.user ? `${req.user.username}/${req.user.role}` : 'anonymous';
    console.log(`[api] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms ${actor}`);

    if (res.statusCode === 401 || res.statusCode === 403) {
      recordDeniedAccess(req, res);
    }
  });

  next();
}

function recordDeniedAccess(req, res) {
  // Fire-and-forget: this must never turn a 403 into a hung request or a 500.
  query(
    `INSERT INTO audit_logs (user_id, username, action, entity, details, ip_address)
     VALUES ($1, $2, 'ACCESS_DENIED', $3, $4, $5)`,
    [
      req.user?.id ?? null,
      req.user?.username ?? null,
      'HTTP',
      `${res.statusCode} on ${req.method} ${req.originalUrl}`,
      clientIp(req),
    ],
  ).catch((error) => console.error('[audit] failed to record denied access:', error.message));
}

export const clientIp = (req) =>
  (req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '').trim().slice(0, 64) || null;
