import ApiError from '../utils/ApiError.js';

export const ROLES = {
  ADMIN: 'ADMIN',
  BASE_COMMANDER: 'BASE_COMMANDER',
  LOGISTICS_OFFICER: 'LOGISTICS_OFFICER',
};

/** Only an Admin sees across bases. Everyone else is pinned to the base on their token. */
export const isGlobalRole = (user) => user?.role === ROLES.ADMIN;

/** Route-level role gate. */
export const authorizeRoles = (...allowedRoles) => (req, _res, next) => {
  if (!req.user || !allowedRoles.includes(req.user.role)) {
    return next(ApiError.forbidden());
  }
  return next();
};

/**
 * READ scoping. An Admin may filter by any base or none; every other role has `baseId`
 * overwritten with their own, so a crafted `?baseId=2` cannot widen their view. Controllers
 * read the result from `req.scope`, never from `req.query`.
 */
export const enforceBaseScope = (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());

  if (isGlobalRole(req.user)) {
    const requested = req.query.baseId;
    const baseId = requested === undefined || requested === '' || requested === 'all'
      ? null
      : Number(requested);
    if (baseId !== null && !Number.isInteger(baseId)) {
      return next(ApiError.badRequest('"baseId" must be a whole number.'));
    }
    req.scope = { baseId, isGlobal: baseId === null };
  } else {
    // Ignore whatever was requested; force the user's own base.
    req.query.baseId = String(req.user.baseId);
    req.scope = { baseId: req.user.baseId, isGlobal: false };
  }

  return next();
};

/**
 * WRITE authorisation. Authentication proves who you are; this proves the record is yours.
 * Skipping it is how "logged-in user edits another base's stock" ships to production.
 */
export function assertBaseAccess(user, baseId, label = 'base') {
  if (isGlobalRole(user)) return;
  if (user.baseId == null || Number(baseId) !== Number(user.baseId)) {
    throw ApiError.forbidden(`Access Denied: you are not authorised to act on this ${label}.`);
  }
}
