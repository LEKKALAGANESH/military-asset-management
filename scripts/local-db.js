/**
 * Postgres on localhost with nothing to install. PGlite is Postgres compiled to WASM, served here
 * over the real wire protocol, so `pg` connects to it exactly as it connects to a hosted database
 * — the schema, transactions and advisory locks are the real ones, not a mock.
 *
 * Data lives in ./pgdata (gitignored). Delete that directory for a clean slate.
 */
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const DATA_DIR = './pgdata';
// Override when a real Postgres already holds 5432.
const PORT = Number(process.env.PGLITE_PORT ?? 5432);

const db = await PGlite.create(DATA_DIR);
const server = new PGLiteSocketServer({
  db,
  port: PORT,
  host: '127.0.0.1',
  // Schema and seed each open their own pool, and the API holds one alongside them.
  maxConnections: 10,
});

await server.start();

console.log(`Postgres (PGlite) on 127.0.0.1:${PORT}, data in ${DATA_DIR}

Put this in .env, then run \`npm run db:reset\`:

  DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres
  DATABASE_SSL=false

Ctrl-C to stop.`);

// Closing in order; a kill mid-write leaves pgdata corrupt.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await server.stop();
    await db.close();
    process.exit(0);
  });
}
