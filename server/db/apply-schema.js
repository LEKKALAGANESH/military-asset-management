import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool, query } from '../config/db.js';

// Applies schema.sql without needing psql on PATH.
const here = dirname(fileURLToPath(import.meta.url));

try {
  const sql = await readFile(join(here, 'schema.sql'), 'utf8');
  await query(sql);
  console.log('✔ Schema applied — tables, indexes and views created.');
} catch (error) {
  console.error('✖ Schema failed:', error.message);
  process.exitCode = 1;
} finally {
  await closePool();
}
