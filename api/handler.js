import app from '../server/app.js';

/**
 * The one serverless function. Every `/api/*` request is rewritten here by vercel.json.
 *
 * A catch-all filename (`api/[...path].js`) does not work outside Next.js: the platform matched
 * only a single segment, so `/api/health` reached the function and `/api/auth/login` returned a
 * 404 that never invoked it. The rewrite matches any depth and carries the original path in
 * `__vpath`, which is restored below — Express routes on `req.url`, and without this every route
 * would resolve to `/api/handler`.
 *
 * Left alone when `__vpath` is absent, so a direct request still routes normally.
 */
export default function handler(req, res) {
  const url = new URL(req.url, 'http://n');
  const path = url.searchParams.get('__vpath');

  if (path !== null) {
    url.searchParams.delete('__vpath');
    const query = url.searchParams.toString();
    req.url = `/api/${path}${query ? `?${query}` : ''}`;
  }

  return app(req, res);
}
