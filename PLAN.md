# Serverless port — design review

## Question
Deploy MAMS on Vercel as a serverless project, in its own folder, without losing the ACID
guarantees the whole system is built on.

## The three approaches, reviewed

| Approach | Cold start | Verdict |
|---|---|---|
| **A. One Node function running the existing Express app** (`api/handler.js`) | ~150–250 ms | **Chosen.** Every middleware, route, guard and test carries over unchanged. One function, one bundle. |
| B. One Vercel function per route | ~120 ms | Rejected. ~15 files each re-composing the auth → RBAC → scope chain by hand. Enormous duplication and regression risk on code that is already verified. |
| C. Edge runtime (Hono + Neon HTTP driver) | ~15 ms | **Rejected on correctness.** The Edge runtime has no TCP sockets, forcing the Neon HTTP driver, which cannot hold an interactive transaction. `BEGIN … pg_advisory_xact_lock … COMMIT` is the core of the transfer logic. Trading atomic transfers for 150 ms is a bad trade for an asset ledger. |

## The two things that actually break in serverless

### 1. Connection exhaustion
`pg.Pool({ max: 10 })` per lambda × N concurrent lambdas exhausts Postgres in minutes.

**Fix:** `max: 1` per instance, pool cached on `globalThis` so warm invocations reuse it,
`allowExitOnIdle: true` so an idle pool never holds the function open, and a **pooled
connection string** (PgBouncer transaction mode) is required.

Transaction-mode pooling is compatible here because the code uses `pg_advisory_xact_lock`
(transaction-scoped), not `pg_advisory_lock` (session-scoped) — the session-scoped variant
would silently leak across pooled clients. `pg` also sends unnamed prepared statements, which
PgBouncer transaction mode allows. A startup heuristic warns when the URL looks like a direct
(unpooled) Neon or Supabase endpoint.

### 2. In-memory rate limiting is near-useless
`express-rate-limit` stores counters in per-instance memory; an attacker spread across
instances gets `limit × instances`. Kept (it still throttles a warm instance) but documented
honestly, with Vercel Firewall — a platform feature, no code — as the real control.

## Also changed
- `app.listen`, SIGTERM handling and entrypoint detection removed; `server/app.js` exports the app.
- Env validation centralised in `server/config/env.js` so a missing `JWT_SECRET` produces one
  clear message instead of an opaque module-load crash in the function logs.
- Frontend and API ship from **one origin**, so CORS is not needed at all and
  `VITE_API_BASE_URL` has no deployed value to set. The allowlist stays for the case where
  someone points a separately-hosted frontend at the API.

## Lanes (disjoint file ownership)
1. **Entry + config** — `api/handler.js`, `dev-server.js`, `server/app.js`, `server/config/{env,db}.js`
2. **Project config** — `package.json`, `vercel.json`, `vite.config.js`, `.env.example`, `.gitignore`
3. **Carried over unchanged** — controllers, routes, services, utils, middlewares, `src/**`
4. **Tests** — `server/tests/*` (import path updated to `../app.js`)
5. **Docs** — `README.md`
