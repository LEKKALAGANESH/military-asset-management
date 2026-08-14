/**
 * The one serverless function. Vercel routes every `/api/*` request here.
 *
 * The catch-all filename matters: with a plain `api/index.js` Vercel would only match `/api`
 * exactly, and routing the rest through a rewrite rewrites `req.url` — which would break the
 * Express router underneath. A catch-all is invoked with the original URL intact, so
 * `app.use('/api', …)` matches exactly as it does locally.
 *
 * An Express app is already a `(req, res)` handler, so no adapter is needed.
 */
export { default } from '../server/app.js';
