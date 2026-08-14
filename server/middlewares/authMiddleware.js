import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import ApiError from '../utils/ApiError.js';

/** Signs the claim set the RBAC layer relies on: who, what role, which base. */
export function signToken(user) {
  return jwt.sign(
    { userId: user.id, username: user.username, role: user.role, baseId: user.base_id ?? null },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn, issuer: 'mams' },
  );
}

/**
 * Verifies the bearer token on every protected request and populates `req.user`.
 * An expired token gets its own code so the client can log the user out cleanly instead of
 * showing a generic error on every subsequent request.
 */
export function authenticateToken(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (!token) {
    return next(ApiError.unauthorized('Missing bearer token.'));
  }

  try {
    const claims = jwt.verify(token, env.jwtSecret, { issuer: 'mams' });
    req.user = {
      id: claims.userId,
      username: claims.username,
      role: claims.role,
      baseId: claims.baseId ?? null,
    };
    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return next(new ApiError(401, 'Session expired. Please sign in again.', { code: 'TOKEN_EXPIRED' }));
    }
    return next(ApiError.unauthorized('Invalid or malformed token.'));
  }
}
