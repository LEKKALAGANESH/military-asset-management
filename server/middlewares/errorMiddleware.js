import ApiError from '../utils/ApiError.js';

export function notFoundHandler(req, _res, next) {
  next(ApiError.notFound(`No route matches ${req.method} ${req.originalUrl}`));
}

/** Postgres constraint violations are user errors, not server errors — translate them. */
function translatePostgresError(error) {
  switch (error.code) {
    case '23505': return new ApiError(409, 'That record already exists.', { constraint: error.constraint });
    case '23503': return new ApiError(400, 'Referenced base or equipment type does not exist.', { constraint: error.constraint });
    case '23514': return new ApiError(400, 'A value violates a database constraint.', { constraint: error.constraint });
    case '22P02': return new ApiError(400, 'Malformed value in request.');

    // Deployment faults, not client mistakes. They surface as 503 with the actual cause
    // named: an unprovisioned database returning a generic 500 is indistinguishable from a
    // code bug, which turns a one-command fix into a hunt through the logs.
    case '42P01':
      return new ApiError(503, 'Database schema is not initialised. Run the schema and seed scripts against DATABASE_URL.', { code: 'SCHEMA_MISSING' });
    case '3D000':
      return new ApiError(503, 'The database named in DATABASE_URL does not exist.', { code: 'DATABASE_MISSING' });
    case '28P01':
    case '28000':
      return new ApiError(503, 'The database rejected these credentials. Check DATABASE_URL.', { code: 'DATABASE_AUTH_FAILED' });
    case 'ECONNREFUSED':
    case 'ENOTFOUND':
    case 'ETIMEDOUT':
      return new ApiError(503, 'Cannot reach the database. Check DATABASE_URL and network access.', { code: 'DATABASE_UNREACHABLE' });

    default: return null;
  }
}

// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity (4 args).
export function errorHandler(error, req, res, _next) {
  const apiError = error instanceof ApiError ? error : translatePostgresError(error);

  if (!apiError) {
    // Log everything server-side, tell the client nothing about internals.
    console.error(`[error] ${req.method} ${req.originalUrl} [${req.requestId}]`, error);
    return res.status(500).json({
      error: 'Internal server error.',
      requestId: req.requestId,
    });
  }

  if (apiError.status >= 500) console.error(`[error] ${req.requestId}`, error);

  return res.status(apiError.status).json({
    error: apiError.message,
    ...(apiError.details ? { details: apiError.details } : {}),
    requestId: req.requestId,
  });
}
