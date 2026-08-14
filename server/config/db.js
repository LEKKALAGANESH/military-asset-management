import pg from 'pg';
import { env } from './env.js';

// pg returns BIGINT/NUMERIC as strings to protect precision. Every aggregate here is a
// bounded item count, so parsing is safe and the dashboard gets numbers, not "42".
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => parseInt(value, 10));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => parseFloat(value));

// TLS is verified by default. Managed providers publish a CA bundle — point DATABASE_CA_CERT
// at it rather than turning verification off.
function sslConfig() {
  if (!env.databaseSsl) return false;
  if (env.databaseCaCert) return { ca: env.databaseCaCert, rejectUnauthorized: true };
  if (env.databaseSslNoVerify) {
    console.warn('[db] TLS certificate verification DISABLED — set DATABASE_CA_CERT in production.');
    return { rejectUnauthorized: false };
  }
  return { rejectUnauthorized: true };
}

/**
 * Connecting straight to Postgres from lambdas exhausts its connection limit under real
 * traffic, and it surfaces as random 500s rather than anything obviously connection-related.
 */
function warnIfUnpooled(url) {
  const isNeonDirect = url.includes('.neon.tech') && !url.includes('-pooler.');
  const isSupabaseDirect = url.includes('.supabase.co') && !url.includes(':6543');
  if (isNeonDirect || isSupabaseDirect) {
    console.warn(
      '[db] DATABASE_URL looks like a DIRECT (unpooled) endpoint. Serverless functions must '
      + 'use the pooled one — Neon: the "-pooler" host; Supabase: the transaction pooler on '
      + 'port 6543. Without it Postgres will run out of connections under load.',
    );
  }
}

/**
 * Cached on globalThis, not module scope: a module can be re-evaluated (dev reloads, bundling
 * boundaries) and each evaluation would open another pool nothing ever closes.
 */
function createPool() {
  warnIfUnpooled(env.databaseUrl);
  const pool = new pg.Pool({
    connectionString: env.databaseUrl,
    ssl: sslConfig(),
    max: env.dbPoolMax,
    // An idle connection must never be why an instance stays billable or a pooler slot
    // stays occupied.
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  });

  // An idle client dropped by the server surfaces here, not on a request.
  pool.on('error', (error) => console.error('[db] idle client error:', error.message));
  return pool;
}

globalThis.__mamsPool ??= createPool();
/** @type {pg.Pool} */
const pool = globalThis.__mamsPool;

/** Run a single parameterised statement. Never interpolate user input into `text`. */
export const query = (text, params) => pool.query(text, params);

/**
 * Every mutation goes through here, so the movement row and its audit row commit or fail
 * together. This is why the API runs on Node, not Edge: an interactive transaction needs a
 * real connection held across statements, which an HTTP database driver cannot provide.
 */
export async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Only for scripts (schema, seed) and tests — a request handler must never close the pool. */
export async function closePool() {
  await pool.end();
  globalThis.__mamsPool = undefined;
}

export default { query, withTransaction, closePool };
