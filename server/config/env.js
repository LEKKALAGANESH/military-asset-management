import 'dotenv/config'; // No-op on Vercel, where env vars are injected; loads .env locally.

/**
 * Validated once per cold start. Centralised because of how serverless fails: a scattered
 * module-level throw surfaces as an opaque FUNCTION_INVOCATION_FAILED with no clue which
 * variable is missing.
 */
function required(name, { minLength = 1 } = {}) {
  const value = process.env[name];
  if (!value || value.length < minLength) {
    throw new Error(
      `Environment variable ${name} is missing or too short (min ${minLength} chars). `
      + 'Set it in the Vercel project settings, or in .env for local development.',
    );
  }
  return value;
}

/**
 * A variable added to a dashboard but left blank arrives as `''`, and `Number('')` is 0 — which
 * reads as "reject every request" for a limit and "open no connections" for a pool. `??` does not
 * catch it because `''` is neither null nor undefined, so blank and non-numeric fall back here.
 * An explicit `0` is still honoured; it is a choice rather than an omission.
 */
function numeric(name, fallback) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export const env = {
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET', { minLength: 16 }),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',

  // Concurrency comes from more instances, not a bigger pool. See config/db.js.
  dbPoolMax: numeric('DB_POOL_MAX', 1),
  databaseSsl: process.env.DATABASE_SSL !== 'false', // Managed Postgres is TLS by default.
  databaseCaCert: process.env.DATABASE_CA_CERT || null,
  databaseSslNoVerify: process.env.DATABASE_SSL_NO_VERIFY === 'true',

  // Empty = same-origin only, the deployed shape: one domain, so no Origin header.
  corsOrigins: (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  rateLimit: numeric('RATE_LIMIT', 300),
  authRateLimit: numeric('AUTH_RATE_LIMIT', 10),
  isProduction: process.env.NODE_ENV === 'production',
};
