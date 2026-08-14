/**
 * A real Postgres on localhost:5432 with nothing to install — PGlite is Postgres compiled to
 * WASM, and this exposes it over the actual wire protocol, so `pg` connects to it exactly as it
 * connects to Neon. The schema, the seed, the advisory locks and the ledger triggers all run
 * unchanged; this is not a mock.
 *
 * It exists so the barrier to running this project is `npm install`, not "install Postgres" or
 * "install Docker" — and so the database path can be verified before a hosted database exists.
 *
 * Data lives in ./pgdata (gitignored). Delete that directory for a clean slate.
 */
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const DATA_DIR = './pgdata';
const PORT = Number(process.env.PGLITE_PORT ?? 5432);

const db = await PGlite.create(DATA_DIR);
const server = new PGLiteSocketServer({
  db,
  port: PORT,
  host: '127.0.0.1',
  // The schema and seed scripts each open their own pool, and the API holds one alongside them.
  maxConnections: 10,
});

await server.start();

console.log(`Postgres (PGlite) listening on 127.0.0.1:${PORT}, data in ${DATA_DIR}`);
console.log('\nPut this in .env, then run `npm run db:reset`:\n');
console.log('  DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres');
console.log('  DATABASE_SSL=false\n');
console.log('Ctrl-C to stop.');

// Without this the WASM database can be torn down mid-write and leave pgdata corrupt.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await server.stop();
    await db.close();
    process.exit(0);
  });
}
