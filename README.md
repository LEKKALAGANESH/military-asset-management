<div align="center">

# Military Asset Management System

**Track vehicles, weapons and ammunition across multiple bases — with role-based access, atomic cross-base transfers, and an audit trail that cannot disagree with the data.**

Packaged for **Vercel**: the React SPA ships as static assets and the Express API runs as a single Node serverless function, both on the same origin.

[![Vercel](https://img.shields.io/badge/Vercel-serverless-000000?logo=vercel&logoColor=white)](https://vercel.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.21-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

<img src="docs/screenshots/dashboard.png" alt="Command dashboard showing opening balance, net movement, assigned, expended and closing balance, with per-category balance charts" width="100%">

</div>

---

## Table of contents

- [Why this design](#why-this-design)
- [Features](#features)
- [Screenshots](#screenshots)
- [Why one function, not per-route or Edge](#why-one-function-not-per-route-or-edge)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Deploy to Vercel](#deploy-to-vercel)
- [Local development](#local-development)
- [Configuration](#configuration)
- [The serverless-specific parts](#the-serverless-specific-parts)
- [Role-based access control](#role-based-access-control)
- [API reference](#api-reference)
- [Security](#security)
- [Testing](#testing)
- [Project structure](#project-structure)
- [License](#license)

---

## Why this design

Most inventory systems keep a `quantity` column and update it on every movement. That column is
a cache of the movement history, and caches drift: one missed decrement in one code path and
the dashboard is permanently wrong, with no way to tell which number is the lie.

**This system stores no stock totals at all.** Every quantity — opening balance, closing
balance, what a base holds right now — is derived from immutable movement records through a
single SQL view. A balance is a *function* of the records, so it is either correct or the
records are wrong, and the records are the audit trail.

That one decision is why the audit log can never disagree with the data, why a transfer is a
genuine two-sided transaction, and — as it turns out — why this runs on the Node runtime rather
than Edge.

---

## Features

**Asset visibility**
- Opening balance, net movement, assigned, expended and closing balance for any base,
  equipment type and date window
- Net movement broken down into purchases, transfers in and transfers out
- Per-category balance charts, a unified activity feed, and current holdings per base

**Operations**
- Purchases, cross-base transfers, personnel assignments and expenditures
- Every stock outflow is refused when the base cannot cover it — checked inside the
  transaction, under a lock, not in the browser
- Live "available at source" hint on the transfer form before you submit

**Access control**
- Three roles: Administrator, Base Commander, Logistics Officer
- Base Commanders are scoped to their own base on reads *and* writes — a crafted `?baseId=`
  cannot widen the view, and a write to another base is refused
- Denied requests are recorded, not just rejected

**Auditability**
- Every mutation appends to `audit_logs` **inside the same transaction as the change**, so a
  rolled-back operation leaves no orphan log line
- Append-only by design: no update or delete endpoint exists anywhere in the API

**Interface**
- Loading, empty and error states on every view that fetches
- Keyboard-reachable throughout, labelled inputs, focus-visible rings, an accessible modal,
  and a table alternative to every chart
- Responsive from 390 px up, with no horizontal page scroll

---

## Screenshots

<table>
<tr>
<td width="50%">
<img src="docs/screenshots/net-movement-modal.png" alt="Modal breaking net movement into purchases, transfers in and transfers out, then restating the closing balance derivation">
<p align="center"><em>Net movement, broken down and derived</em></p>
</td>
<td width="50%">
<img src="docs/screenshots/transfer-stock-guard.png" alt="Transfer form rejecting a request for 999,999 units against 140 available, with the submit button disabled">
<p align="center"><em>Stock guard — server-enforced, surfaced early</em></p>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/screenshots/purchases.png" alt="Purchases page showing the recording form and the resulting history table">
<p align="center"><em>Purchases — form and history</em></p>
</td>
<td width="50%">
<img src="docs/screenshots/audit-trail.png" alt="Audit trail listing actions with user, role, entity, details and IP address">
<p align="center"><em>Audit trail: who, what, when, from where</em></p>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/screenshots/rbac-base-commander.png" alt="Base Commander dashboard with the base selector locked to Fort Alpha and no audit trail navigation entry">
<p align="center"><em>Base Commander — scope locked, nav reduced</em></p>
</td>
<td width="50%">
<img src="docs/screenshots/api-health.png" alt="API health endpoint returning status ok, database connected and schema ready">
<p align="center"><em>Readiness, not just liveness</em></p>
</td>
</tr>
</table>

<div align="center">
<img src="docs/screenshots/mobile.png" alt="Dashboard at 390 pixels wide with no horizontal overflow" width="300">
<p><em>390 px — no horizontal overflow</em></p>
</div>

---

## Why one function, not per-route or Edge

```
Browser ──► https://your-app.vercel.app
              ├── /                 →  static SPA (CDN)
              ├── /transfers        →  SPA fallback rewrite
              └── /api/*            →  api/[...path].js  (Node function)
                                          └──► Postgres (pooled)
```

Same origin for both halves means **no CORS**, no second deployment, and `VITE_API_BASE_URL`
has no deployed value to set.

Three options were on the table. The reasoning matters more than the result, because two of
them quietly break this particular app:

| Approach | Cold start | Verdict |
|---|---|---|
| **One function running Express** | ~150–250 ms | **Chosen.** Every middleware, guard, route and test carries over unchanged. One bundle, one code path, identical behaviour to a long-running server. |
| One function per route | ~120 ms | Rejected. ~15 files each re-composing the `authenticate → authorizeRoles → enforceBaseScope` chain by hand, for ~100 ms. Duplication on already-verified code is the expensive kind. |
| Edge runtime (Hono + Neon HTTP driver) | ~15 ms | **Rejected on correctness.** Edge has no TCP sockets, which forces an HTTP database driver, which cannot hold an interactive transaction. `BEGIN … pg_advisory_xact_lock … COMMIT` is how a transfer stays atomic. Trading that for 150 ms on an asset ledger is a bad trade. |

If cold start ever becomes the binding constraint, the move is Fluid Compute or a warm
instance — not giving up transactions.

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Hosting | Vercel — static SPA + one Node function | One origin, one deploy, no CORS |
| Database | PostgreSQL 14+ (**pooled** connection) | A transfer is two balance changes that must both happen or neither |
| Data access | `pg` with parameterised SQL | Explicit transactions and advisory locks, no ORM between the code and the guarantees it relies on |
| API | Node.js + Express 4 | Middleware composition maps cleanly onto authenticate → authorise → scope |
| Auth | JWT + bcrypt (cost 12) | Stateless tokens carrying `userId`, `role` and `baseId`; hashes never leave the database |
| Frontend | React 18 + Vite 6 | — |
| Styling | Tailwind CSS 3.4 | — |
| Charts | Recharts | Faceted per category so units are never mixed on one axis |

---

## Architecture

### The inventory model

```
Opening Balance = Σ every movement that occurred BEFORE the window opened
Net Movement    = Purchases + Transfers In − Transfers Out    (inside the window)
Closing Balance = Opening Balance + Net Movement − Assigned − Expended
```

All five movement sources are normalised into one signed-delta view, `asset_ledger`:

```sql
CREATE VIEW asset_ledger AS
    SELECT base_id,             equipment_type_id, occurred_at, 'PURCHASE',      quantity  FROM purchases
    UNION ALL
    SELECT destination_base_id, equipment_type_id, occurred_at, 'TRANSFER_IN',   quantity  FROM transfers WHERE status = 'COMPLETED'
    UNION ALL
    SELECT source_base_id,      equipment_type_id, occurred_at, 'TRANSFER_OUT', -quantity  FROM transfers WHERE status = 'COMPLETED'
    UNION ALL
    SELECT base_id,             equipment_type_id, occurred_at, 'ASSIGNMENT',   -quantity  FROM assignments
    UNION ALL
    SELECT base_id,             equipment_type_id, occurred_at, 'EXPENDITURE',  -quantity  FROM expenditures;
```

One aggregate answers the entire dashboard — both sides of the equation in a single pass over
the ledger, split by movement type.

A useful property falls out of this: with no base filter, `TRANSFER_IN` and `TRANSFER_OUT`
cancel exactly, so global net movement equals purchases — because a transfer relocates stock
without creating or destroying any. The test suite asserts it.

### Atomic transfers

```
BEGIN
  ├─ verify source base, destination base and equipment type exist
  ├─ pg_advisory_xact_lock(source_base_id, equipment_type_id)
  ├─ SELECT SUM(delta) FROM asset_ledger   →  409 if short
  ├─ INSERT INTO transfers  (status COMPLETED)
  └─ INSERT INTO audit_logs
COMMIT          -- or ROLLBACK, leaving both bases exactly as they were
```

Available stock is an aggregate over a view, so it cannot be locked with `SELECT … FOR UPDATE`.
Without a lock, two concurrent transfers of 60 units each read the same balance of 100, both
pass the check, and the base lands at −20. A **transaction-scoped advisory lock** keyed on
`(base_id, equipment_type_id)` serialises only the writers touching that one stock bucket and
releases automatically on `COMMIT` or `ROLLBACK`.

Only the source is locked: the destination can only gain stock, so it cannot go negative, and
a single lock cannot deadlock against a transfer running the other way.

Full architecture notes, the ER diagram and endpoint listings live in
[`docs/DOCUMENTATION.md`](docs/DOCUMENTATION.md). The port's design review is in
[`PLAN.md`](PLAN.md).

---

## Deploy to Vercel

### Prerequisites

- A Vercel account
- **A PostgreSQL database with a pooled connection string.** This is not optional — see
  [connection pooling](#connection-pooling--the-one-that-bites).

| Provider | Use this connection string |
|---|---|
| [Neon](https://neon.tech) | the host containing **`-pooler`** |
| [Supabase](https://supabase.com) | the **transaction pooler**, port **6543** (not 5432) |
| Vercel Postgres | `POSTGRES_URL` (already pooled) |

### Steps

**1. Create the schema and demo data** — run locally, against your remote database:

```bash
npm install
cp .env.example .env          # set DATABASE_URL and JWT_SECRET
npm run db:reset              # schema + seed
```

**2. Generate a real JWT secret:**

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

**3. Deploy:**

```bash
npx vercel            # preview
npx vercel --prod     # production
```

Or import the repository in the Vercel dashboard — the project root is the repository root, so
the default settings are correct.

**4. Set the environment variables** in *Project Settings → Environment Variables*:

| Variable | Required | Value |
|---|---|---|
| `DATABASE_URL` | ✅ | the **pooled** connection string |
| `JWT_SECRET` | ✅ | the generated secret, min 16 chars |
| `DATABASE_SSL` | | `true` (the default) |
| `JWT_EXPIRES_IN` | | `8h` |
| `DB_POOL_MAX` | | `1` (the default — read the pooling note before raising it) |
| `CORS_ORIGIN` | | leave **empty**; only needed if a separately-hosted frontend calls this API |
| `RATE_LIMIT` / `AUTH_RATE_LIMIT` | | `300` / `10` |

Vercel auto-detects the build (`npm run build` → `dist/`) and deploys everything in `api/` as
functions. Redeploy after adding the variables.

**5. Verify:**

```bash
curl https://your-app.vercel.app/api/health
# {"status":"ok","database":"connected","schema":"ready", ...}
```

A **503** with `"schema":"missing"` means step 1 was skipped: the database is reachable but has
no tables. Run `npm run db:reset` against the same `DATABASE_URL` — nothing needs redeploying,
because the schema lives in the database, not in the bundle.

### Sample accounts

| Role | Username | Password | Scope |
|---|---|---|---|
| Administrator | `admin_user` | `AdminPass123!` | All bases |
| Base Commander | `commander_alpha` | `CommandPass123!` | Fort Alpha |
| Base Commander | `commander_bravo` | `CommandPass123!` | Camp Bravo |
| Logistics Officer | `logistics_officer` | `LogisticsPass123!` | Fort Alpha |

The sign-in screen offers the first three as one-click fills, so the access model can be
demonstrated without retyping.

---

## Local development

`vercel dev` reproduces the platform routing but needs a linked project and a login, so two
scripts run the same exported app over plain HTTP:

```bash
npm run db:local   # terminal 1 — Postgres on :5432, nothing to install
npm run db:reset   #              schema + demo data
npm run dev:api    # terminal 2 — the same app Vercel invokes, on :4000
npm run dev        # terminal 3 — Vite on :5173, proxying /api to :4000
```

`db:local` runs **PGlite** — Postgres compiled to WebAssembly — behind the real wire protocol, so
`pg` connects to it exactly as it connects to Neon and the schema, transactions and advisory locks
all behave. No Docker, no Postgres install; `npm install` is the whole prerequisite. Data lives in
`pgdata/` (gitignored) — delete it for a clean slate. Point `.env` at it with:

```ini
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres
DATABASE_SSL=false
```

For a deployed database, use a hosted Postgres instead — see [Prerequisites](#prerequisites).

The dev proxy **strips the browser's `Origin` header** so local development matches the
deployed same-origin shape. Without it, dev would be the only environment needing a CORS
allowlist — a config knob that exists purely to paper over a difference from production.

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server (:5173) |
| `npm run dev:api` | Local API host (:4000) |
| `npm run db:local` | Postgres (PGlite) on :5432 — no install required |
| `npm run build` | SPA → `dist/` |
| `npm run db:schema` | Applies `server/db/schema.sql` (no `psql` needed) |
| `npm run db:seed` | Demo data; asserts no negative stock |
| `npm run db:reset` | Schema + seed |
| `npm test` | Full suite |

---

## Configuration

<details>
<summary><strong>Environment variables</strong></summary>

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | **Pooled** Postgres connection string |
| `JWT_SECRET` | ✅ | — | Token signing key, min 16 chars |
| `JWT_EXPIRES_IN` | | `8h` | Token lifetime |
| `DATABASE_SSL` | | `true` | `false` only for a local Postgres |
| `DATABASE_CA_CERT` | | — | Provider CA bundle (PEM) — preferred over disabling verification |
| `DATABASE_SSL_NO_VERIFY` | | `false` | Escape hatch for self-signed certs. Never in production |
| `DB_POOL_MAX` | | `1` | One connection per function instance |
| `CORS_ORIGIN` | | *(empty)* | Empty means same-origin only, which is the deployed shape |
| `RATE_LIMIT` | | `300` | Requests / minute / IP |
| `AUTH_RATE_LIMIT` | | `10` | Sign-in attempts / 15 min / IP |
| `PORT` | | `4000` | Local development only |

</details>

---

## The serverless-specific parts

Everything below is what actually changes when this app moves from a long-running server to
functions. It is the whole diff worth reviewing.

### Connection pooling — the one that bites

A serverless function scales by running **more instances**, each with its own process memory.
A `pg.Pool({ max: 10 })` per instance × 50 warm instances is 500 connections against a database
that allows ~100, and the symptom is random 500s that look nothing like a connection problem.

The configuration in `server/config/db.js`:

- `max: 1` — one connection per instance. Concurrency comes from more instances, not a bigger pool.
- The pool is cached on **`globalThis`**, not module scope, so a re-evaluated module reuses it
  instead of leaking a second pool nothing will ever close.
- `allowExitOnIdle: true` + a 10 s idle timeout — an idle connection must never be why an
  instance stays billable or why a pooler slot stays occupied.
- A **pooled connection string is required**, and a startup heuristic warns loudly if the URL
  looks like a direct Neon or Supabase endpoint.

**Why transaction-mode pooling is safe here:** the stock guard uses `pg_advisory_xact_lock`
(transaction-scoped), not `pg_advisory_lock` (session-scoped). A session-scoped lock would leak
across pooled clients and silently stop protecting anything. `pg` also sends unnamed prepared
statements, which PgBouncer transaction mode allows.

### Rate limiting is weaker than it looks

`express-rate-limit` keeps counters in one instance's memory. Traffic spread across instances
gets `limit × instances`. It is kept because it still throttles an attacker hitting a warm
instance, but **the real control at this tier is Vercel's Firewall rate limiting** — configured
on the project, no code. Enable it on `/api/auth/login` before treating brute-force as handled.

### Everything stateful had to go

No `app.listen`, no SIGTERM handler, no in-process counters or caches. An instance can be
frozen or discarded between any two requests, so anything outliving a request is either
stateless or pinned to `globalThis`.

### Health reports readiness, not liveness

`SELECT 1` succeeds against a completely empty database, so a health check built on it reports
`"connected"` while every real endpoint 500s — which is exactly the state a deploy lands in
before the schema is applied. `/api/health` verifies the schema exists and returns **503** when
it does not, and Postgres codes for "not provisioned", "no such database", "bad credentials"
and "unreachable" surface as 503 naming the cause rather than a generic 500.

### Env validation is centralised

`server/config/env.js` validates on cold start and names the missing variable. Scattered
module-level `throw`s surface in Vercel logs as an opaque `FUNCTION_INVOCATION_FAILED` with no
indication of which variable is wrong.

### The catch-all filename is load-bearing

`api/[...path].js`, not `api/index.js`. A plain `index.js` only matches `/api` exactly, and
routing the rest through a `vercel.json` rewrite rewrites `req.url` — which breaks the Express
router underneath. A catch-all is invoked with the original URL intact, so `app.use('/api', …)`
matches exactly as it does locally. An Express app is already a `(req, res)` handler, so
`api/[...path].js` is a one-line re-export with no adapter.

---

## Role-based access control

| Capability | Admin | Base Commander | Logistics Officer |
|---|:--:|:--:|:--:|
| Scope of visible data | All bases | Own base only | Own base only |
| View dashboard / stock | ✅ | ✅ | ✅ |
| Record purchases | ✅ | ✅ own base | ✅ own base |
| Initiate transfers | ✅ | ❌ | ✅ from own base |
| View transfers | ✅ | ✅ involving own base | ✅ involving own base |
| Assign to personnel | ✅ | ✅ own base | ❌ |
| Record expenditures | ✅ | ✅ own base | ❌ |
| Read the audit trail | ✅ | ❌ | ❌ |
| Create users / bases / equipment | ✅ | ❌ | ❌ |

Cross-base movement is a logistics function; issuing kit to personnel and writing off consumed
stock are command decisions. Separating them is the point of having two non-admin roles.

Enforced in three layers: **`authorizeRoles(...)`** gates the route, **`enforceBaseScope`**
overwrites `baseId` on reads for any non-admin, and **`assertBaseAccess(...)`** confirms the
caller owns the record before any write. Hiding a link in the UI is convenience, not control —
calling the endpoint directly still returns 403, and the attempt is written to `audit_logs`.

---

## API reference

All routes are prefixed `/api`. Every route except `/health` and `/auth/login` requires
`Authorization: Bearer <token>`.

<details>
<summary><strong>Endpoints</strong></summary>

| Method | Route | Roles | Purpose |
|---|---|---|---|
| GET | `/health` | public | Liveness + schema readiness |
| POST | `/auth/login` | public | Sign in, returns JWT + user |
| GET | `/auth/me` | any | Current user, re-read from the database |
| POST | `/auth/register` | Admin | Create a user |
| GET | `/auth/users` | Admin | List users (never returns hashes) |
| GET | `/assets/metrics` | any | Opening / net / assigned / expended / closing |
| GET | `/assets/balances` | any | The same metrics per equipment type |
| GET | `/assets/movements` | any | Unified activity feed |
| GET | `/assets/stock` | any | Current holdings from the `assets` view |
| GET | `/purchases` | any | Purchase history |
| POST | `/purchases` | Admin, Logistics, Commander | Record incoming stock |
| GET | `/transfers` | any | Transfers involving the caller's base |
| GET | `/transfers/:id` | any | One transfer |
| POST | `/transfers` | Admin, Logistics | Atomic cross-base transfer |
| GET | `/assignments` | any | Assignment history |
| POST | `/assignments` | Admin, Commander | Issue equipment to personnel |
| GET | `/expenditures` | any | Expenditure history |
| POST | `/expenditures` | Admin, Commander | Record consumed stock |
| GET | `/bases` · `/equipment-types` · `/meta` | any | Reference data |
| POST | `/bases` · `/equipment-types` | Admin | Create reference data |
| GET | `/audit-logs` · `/audit-logs/actions` | Admin | The audit trail |

Reads accept `baseId`, `equipmentTypeId`, `startDate`, `endDate`, `limit`, `offset`.
For any non-admin, `baseId` is overwritten server-side with their own.

</details>

<details>
<summary><strong>Status codes</strong></summary>

| Code | Meaning |
|---|---|
| 200 / 201 | Success |
| 400 | Validation failure (bad type, out of range, inverted date window) |
| 401 | Missing, malformed or expired token — `details.code = TOKEN_EXPIRED` when expired |
| 403 | Role not permitted, or the record belongs to another base |
| 404 | Unknown route, or a referenced base / equipment / transfer does not exist |
| 409 | Insufficient stock, or duplicate unique value |
| 429 | Rate limit exceeded |
| 503 | Database unreachable or schema not initialised — `details.code` names which |
| 500 | Unexpected failure; the body carries only a `requestId` |

Every error response is `{ error, details?, requestId }`.

</details>

<details>
<summary><strong>Example requests</strong></summary>

```bash
# Sign in
TOKEN=$(curl -s -X POST https://your-app.vercel.app/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin_user","password":"AdminPass123!"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')

# Dashboard metrics
curl -s "https://your-app.vercel.app/api/assets/metrics?startDate=2026-01-01" \
  -H "Authorization: Bearer $TOKEN"

# Cross-base transfer
curl -s -X POST https://your-app.vercel.app/api/transfers \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"sourceBaseId":1,"destinationBaseId":2,"equipmentTypeId":1,"quantity":10}'
```

</details>

---

## Security

- **bcrypt** (cost 12) for passwords; hashes never leave the database
- **Type-casting validation** on every input — `{"username":{"$gt":""}}` is rejected with 400
  before it reaches a query. Nothing non-primitive crosses the boundary
- **Parameterised SQL** everywhere; no user value is ever interpolated into a statement
- **JWT** with an expiry, verified per request, issuer-checked
- **Rate limiting** in code, with Vercel Firewall as the real control at this tier
- **CORS** with an explicit origin allowlist, never `*` — empty by default (same-origin)
- **Helmet** security headers; 100 KB request body ceiling
- **Authorisation on writes**, not just authentication — the most-missed check in this class
  of application
- **Audit trail** written in the same transaction as the change it records
- Sign-in runs a hash comparison even for an unknown username, so response timing does not
  reveal which accounts exist

---

## Testing

68 automated tests cover the balance arithmetic, the RBAC layer, input validation, error
mapping, and the live HTTP API against a real PostgreSQL instance — including transaction
rollback on an overdraft, base-scope enforcement, concurrent transfers, and audit capture.

> **Note:** the test suites are excluded from this repository via `.gitignore`, so `npm test`
> on a fresh clone will not find them.

---

## Project structure

```
├── api/[...path].js      The one function — re-exports the Express app
├── dev-server.js         Local HTTP host for the same app
├── server/
│   ├── app.js            Express app, exported not started
│   ├── config/           env.js (validated) · db.js (serverless pool)
│   ├── controllers/      auth · asset · purchase · transfer · assignment · reference · audit
│   ├── middlewares/      auth (JWT) · rbac · logger/audit · error
│   ├── services/         balance (pure math) · stock (locks + guards) · audit
│   ├── routes/           One router per resource, composed in index.js
│   └── db/               schema.sql · apply-schema.js · seed.js
├── src/                  React SPA — components · context · hooks · pages · services
├── docs/                 DOCUMENTATION.md · screenshots
├── vercel.json           SPA fallback + cache headers
└── vite.config.js        Dev proxy + vendor chunk splitting
```

---

## License

Released under the [MIT License](LICENSE).
