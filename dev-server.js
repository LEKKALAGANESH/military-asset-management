import { query } from './server/config/db.js';
import app from './server/app.js';

/**
 * Local API host. `vercel dev` reproduces the platform routing but needs a linked project and
 * a login, so this runs the exact same exported app over plain HTTP for development and for
 * the integration tests. Vite proxies /api here (see vite.config.js).
 */
const PORT = Number(process.env.PORT ?? 4000);

app.listen(PORT, () => {
  console.log(`[dev] MAMS API on http://localhost:${PORT}/api`);
  query('SELECT 1')
    .then(() => console.log('[dev] database connection OK'))
    .catch((error) => console.error('[dev] DATABASE UNREACHABLE:', error.message));
});
