# Military Asset Management System — Technical Documentation

> Source document for the submission PDF. Export with any Markdown → PDF tool.

**Version 1.0** · PostgreSQL · Node.js/Express · React (Vite) · Tailwind CSS

---

## 1. Overview

MAMS tracks vehicles, weapons and ammunition across multiple military bases. It answers one
operational question at any point in time — *what does this base hold, and how did it get
there?* — and it answers it without ever storing a stock total that could be wrong.

**Objectives, and how each is met**

| Objective | Mechanism |
|---|---|
| End-to-end asset visibility | `asset_ledger` view + one aggregate query yields opening balance, net movement, assignments, expenditures and closing balance for any base / equipment / date window |
| Operational accountability | Cross-base transfers execute inside a single database transaction, with the audit row written in the same transaction |
| Granular security | Three roles; base scope injected server-side on reads, ownership asserted on writes |
| Auditability | Every mutation appends to `audit_logs`; the table has no update or delete endpoint anywhere in the API |

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  React SPA (Vite + Tailwind)                                     │
│  Pages: Dashboard · Purchases · Transfers · Assignments · Audit   │
│  AuthContext (JWT in localStorage) → axios interceptors          │
└───────────────────────────┬──────────────────────────────────────┘
                            │ HTTPS · Authorization: Bearer <JWT>
┌───────────────────────────▼──────────────────────────────────────┐
│  Express API                                                     │
│                                                                  │
│  helmet → cors(allowlist) → json(100kb) → requestLogger →        │
│  rateLimit → authenticateToken → authorizeRoles →                │
│  enforceBaseScope → controller → errorHandler                    │
│                                                                  │
│  services: balance (pure) · stock (advisory lock) · audit        │
└───────────────────────────┬──────────────────────────────────────┘
                            │ pg Pool · parameterised SQL · BEGIN/COMMIT
┌───────────────────────────▼──────────────────────────────────────┐
│  PostgreSQL                                                      │
│  bases · users · equipment_types                                 │
│  purchases · transfers · assignments · expenditures              │
│  audit_logs                                                      │
│  VIEW asset_ledger  →  VIEW assets                               │
└──────────────────────────────────────────────────────────────────┘
```

### Why PostgreSQL, not a document store

A transfer is two balance changes that must both happen or neither. That is a transaction, and
a transaction needs ACID guarantees. Postgres also gives foreign keys (a purchase cannot
reference a base that does not exist), `CHECK` constraints (a quantity cannot be zero or
negative at the storage layer), and advisory locks for the concurrency case below.

### Why balances are derived, not stored

A `quantity` column on an `assets` table is a cache of the movement history. Caches drift: one
missed decrement in one code path and the dashboard lies permanently, with no way to tell which
number is wrong. Deriving from the ledger means the balance is a *function* of the records, so
it is either right or the records are wrong — and the records are the audit trail.

The cost is that a balance is a `SUM` rather than a lookup. Indexes on
`(base_id, equipment_type_id)` and `occurred_at` keep that cheap at assignment scale. At a size
where it stopped being cheap, the fix is a materialised view refreshed on write — the query
shape does not change.

---

## 3. Data model

### ER diagram

```
        ┌──────────────┐                    ┌────────────────────┐
        │    bases     │                    │  equipment_types   │
        ├──────────────┤                    ├────────────────────┤
        │ id      (PK) │                    │ id            (PK) │
        │ name  UNIQUE │                    │ name       UNIQUE  │
        │ location     │                    │ category   (CHECK) │
        │ created_at   │                    │ unit               │
        └──┬───────┬───┘                    └─────────┬──────────┘
           │       │                                  │
           │       │  ┌───────────────────────────────┤
           │       │  │                               │
   ┌───────▼─────┐ │  │  ┌──────────────┐   ┌─────────▼──────────┐
   │    users    │ │  │  │  purchases   │   │    assignments     │
   ├─────────────┤ │  │  ├──────────────┤   ├────────────────────┤
   │ id     (PK) │ │  │  │ id      (PK) │   │ id            (PK) │
   │ username UQ │ │  └──┤ base_id (FK) │   │ base_id       (FK) │
   │ password_ha │ │     │ equipment(FK)│   │ equipment_type(FK) │
   │ role  CHECK │ │     │ quantity  >0 │   │ quantity       >0  │
   │ base_id(FK) ├─┘     │ unit_cost    │   │ assigned_to        │
   │ is_active   │       │ supplier     │   │ personnel_rank     │
   └──────┬──────┘       │ occurred_at  │   │ occurred_at        │
          │              │ created_by(FK)   │ created_by    (FK) │
          │              └──────────────┘   └────────────────────┘
          │
          │              ┌──────────────────┐   ┌──────────────────┐
          │              │    transfers     │   │   expenditures   │
          │              ├──────────────────┤   ├──────────────────┤
          │              │ id          (PK) │   │ id          (PK) │
          │              │ source_base (FK) │   │ base_id     (FK) │
          │              │ dest_base   (FK) │   │ equipment   (FK) │
          │              │ equipment   (FK) │   │ quantity     >0  │
          │              │ quantity     >0  │   │ reason           │
          │              │ status   CHECK   │   │ occurred_at      │
          │              │ occurred_at      │   │ created_by  (FK) │
          ├─────────────►│ initiated_by(FK) │   └──────────────────┘
          │              │ CHECK src<>dest  │
          │              └──────────────────┘
          │
          │              ┌──────────────────┐
          └─────────────►│    audit_logs    │
                         ├──────────────────┤
                         │ id          (PK) │
                         │ user_id     (FK) │
                         │ username         │  ← denormalised: the trail
                         │ action           │    outlives the user row
                         │ entity, entity_id│
                         │ details          │
                         │ ip_address       │
                         │ created_at       │
                         └──────────────────┘

     VIEW asset_ledger  =  purchases (+qty)
                         ∪ transfers → destination (+qty, COMPLETED only)
                         ∪ transfers → source      (−qty, COMPLETED only)
                         ∪ assignments  (−qty)
                         ∪ expenditures (−qty)

     VIEW assets        =  SUM(delta) per (base_id, equipment_type_id)
```

### Table notes

| Table | Notes |
|---|---|
| `users` | `CHECK (role = 'ADMIN' OR base_id IS NOT NULL)` — a scoped role with no base would have nothing to scope to |
| `transfers` | `CHECK (source_base_id <> destination_base_id)`; only `status = 'COMPLETED'` moves stock |
| all movements | `occurred_at` is the business event time (filterable, back-datable); `created_at` is the immutable insert time |
| `audit_logs` | append-only by design; `username` is denormalised so the trail survives `ON DELETE SET NULL` |

### Indexes

`(base_id, equipment_type_id)` on all four movement tables · `(source_base_id, …)` and
`(destination_base_id, …)` on transfers · `occurred_at DESC` on all four · `created_at DESC`,
`user_id` and `action` on `audit_logs` · `base_id` on users.

---

## 4. The calculation

```
Opening Balance = Σ delta  WHERE occurred_at <  startDate
Net Movement    = Purchases + Transfers In − Transfers Out    (within the window)
Closing Balance = Opening + Net Movement − Assigned − Expended
```

Implemented as one aggregate with `FILTER` clauses, so the pre-window and in-window sums come
from a single pass:

```sql
SELECT movement_type,
       COALESCE(SUM(delta) FILTER (WHERE occurred_at <  $3), 0)::int AS opening_delta,
       COALESCE(SUM(delta) FILTER (WHERE occurred_at >= $3
                                     AND occurred_at <= $4), 0)::int AS period_delta
  FROM asset_ledger
 WHERE ($1::int IS NULL OR base_id = $1)
   AND ($2::int IS NULL OR equipment_type_id = $2)
 GROUP BY movement_type;
```

The arithmetic that turns those rows into the five headline numbers lives in
`services/balance.js` as a pure function, which is why it can be unit-tested without a
database.

**A property worth noting:** with no base filter (the Admin's global view), `TRANSFER_IN` and
`TRANSFER_OUT` both appear and cancel exactly. Global net movement therefore equals purchases —
which is correct, because a transfer relocates stock without creating or destroying any. The
integration suite asserts this.

---

## 5. Atomic transfers and concurrency

```
BEGIN
  ├─ verify source base, destination base and equipment type exist
  ├─ pg_advisory_xact_lock(source_base_id, equipment_type_id)
  ├─ SELECT SUM(delta) FROM asset_ledger  →  refuse with 409 if short
  ├─ INSERT INTO transfers (… status 'COMPLETED' …)
  └─ INSERT INTO audit_logs (…)
COMMIT          -- or ROLLBACK, leaving both bases exactly as they were
```

**Why an advisory lock.** Available stock is an aggregate over a view, so it cannot be locked
with `SELECT … FOR UPDATE`. Without a lock, two concurrent transfers of 60 units each read the
same balance of 100, both pass the check, and the base ends at −20. A transaction-scoped
advisory lock keyed on `(base_id, equipment_type_id)` serialises only the writers touching that
one stock bucket, and releases automatically on `COMMIT` or `ROLLBACK`.

Only the *source* is locked: the destination can only gain stock, so it cannot go negative, and
a single lock cannot deadlock against a transfer running the other way.

The same guard protects assignments and expenditures — every path that removes stock.

---

## 6. Authentication and RBAC

**Sign-in** verifies a bcrypt hash (cost 12) and returns a JWT carrying `userId`, `username`,
`role` and `baseId`, with an expiry and an issuer claim. A hash comparison runs even when the
username does not exist, so response timing does not leak which accounts are registered.

**Two enforcement layers:**

1. `authorizeRoles(...roles)` — route-level gate. Wrong role → 403.
2. `enforceBaseScope` — read scoping. An Admin may filter by any base or none; every other role
   has `baseId` **overwritten** with their own, so a crafted `?baseId=2` cannot widen a view.
3. `assertBaseAccess(user, baseId)` — write authorisation. Confirms the caller owns the record
   *before* mutating it. Authentication proves identity; this proves ownership.

### Authorisation matrix

| Capability | Admin | Base Commander | Logistics Officer |
|---|:--:|:--:|:--:|
| Data scope | All bases | Own base | Own base |
| Dashboard, stock, movements | ✅ | ✅ own base | ✅ own base |
| `POST /purchases` | ✅ | ✅ own base | ✅ own base |
| `POST /transfers` | ✅ | ❌ 403 | ✅ from own base |
| `GET /transfers` | ✅ | ✅ involving own base | ✅ involving own base |
| `POST /assignments` | ✅ | ✅ own base | ❌ 403 |
| `POST /expenditures` | ✅ | ✅ own base | ❌ 403 |
| `GET /audit-logs` | ✅ | ❌ 403 | ❌ 403 |
| `POST /auth/register`, `/bases`, `/equipment-types` | ✅ | ❌ 403 | ❌ 403 |

Rationale: cross-base movement is a logistics function, while issuing kit to personnel and
writing off consumed stock are command decisions. Separating them is the point of having two
non-admin roles rather than one.

---

## 7. Audit trail

`recordAudit(client, …)` is called with the **transaction client** of the mutation being
logged, never the pool. The audit row commits with the change it describes or rolls back with
it — an audit trail that can disagree with the data is worse than none.

What a controller can never record is a request that never reached it. `requestLogger` closes
that gap: any 401 or 403 is written as an `ACCESS_DENIED` entry with the method, path and IP.

Recorded actions: `PURCHASE` · `TRANSFER` · `ASSIGNMENT` · `EXPENDITURE` · `LOGIN` ·
`LOGIN_FAILED` · `ACCESS_DENIED` · `USER_CREATED` · `BASE_CREATED` · `EQUIPMENT_TYPE_CREATED`.

There is no update or delete endpoint for `audit_logs` anywhere in the API.

---

## 8. API reference

Prefix `/api`. All routes except `/health` and `/auth/login` require
`Authorization: Bearer <token>`.

| Method | Route | Roles | Body / query |
|---|---|---|---|
| GET | `/health` | public | — |
| POST | `/auth/login` | public | `username`, `password` |
| GET | `/auth/me` | any | — |
| POST | `/auth/register` | Admin | `username`, `password`, `fullName`, `role`, `baseId` |
| GET | `/auth/users` | Admin | — |
| GET | `/assets/metrics` | any | `baseId`, `equipmentTypeId`, `startDate`, `endDate` |
| GET | `/assets/balances` | any | same |
| GET | `/assets/movements` | any | same + `movementType`, `limit`, `offset` |
| GET | `/assets/stock` | any | `equipmentTypeId` |
| GET | `/purchases` | any | `equipmentTypeId`, `startDate`, `endDate`, `limit`, `offset` |
| POST | `/purchases` | Admin, Logistics, Commander | `baseId`, `equipmentTypeId`, `quantity`, `unitCost?`, `supplier?`, `occurredAt?` |
| GET | `/transfers` | any | as above |
| GET | `/transfers/:id` | any | — |
| POST | `/transfers` | Admin, Logistics | `sourceBaseId`, `destinationBaseId`, `equipmentTypeId`, `quantity`, `notes?`, `occurredAt?` |
| GET | `/assignments` | any | as above |
| POST | `/assignments` | Admin, Commander | `baseId`, `equipmentTypeId`, `quantity`, `assignedTo`, `personnelRank?`, `purpose?` |
| GET | `/expenditures` | any | as above |
| POST | `/expenditures` | Admin, Commander | `baseId`, `equipmentTypeId`, `quantity`, `reason` |
| GET | `/bases` · `/equipment-types` · `/meta` | any | — |
| POST | `/bases` | Admin | `name`, `location` |
| POST | `/equipment-types` | Admin | `name`, `category`, `unit?` |
| GET | `/audit-logs` | Admin | `action`, `userId`, `startDate`, `endDate`, `limit`, `offset` |
| GET | `/audit-logs/actions` | Admin | — |

### Status codes

| Code | Meaning |
|---|---|
| 200 / 201 | Success |
| 400 | Validation failure (bad type, out of range, inverted date window) |
| 401 | Missing, malformed or expired token. `details.code = TOKEN_EXPIRED` when expired |
| 403 | Role not permitted, or record belongs to another base |
| 404 | Unknown route, or a referenced base / equipment / transfer does not exist |
| 409 | Insufficient stock, or duplicate unique value |
| 429 | Rate limit exceeded |
| 500 | Unexpected failure. Body carries only a `requestId`; details stay in the server log |

Every error response is `{ error, details?, requestId }`.

---

## 9. Frontend

| Concern | Approach |
|---|---|
| Session | `AuthContext` holds the user; token in `localStorage`, attached by an axios request interceptor |
| Expiry | A 401 on any request clears the token and redirects to `/login?expired=1` |
| Refresh | `ProtectedRoute` waits for `/auth/me` before deciding, so a refresh never flashes the login page |
| Fetch state | `useApi` returns `{data, loading, error, refetch}` and discards responses whose filter key is stale |
| States | Every fetching view renders loading, empty and error — `AsyncBoundary` makes omitting one impossible |
| Tables | One data-driven `DataTable`; columns are declared as data, not copy-pasted markup |
| Reference data | `useMeta` caches the in-flight `/meta` promise at module scope — five pages mounting still make one request |

### Dashboard

Five metric cards (Opening, Net Movement, Assigned, Expended, Closing). Net Movement is a real
`<button>` opening a modal that breaks it into purchases, transfers in and transfers out, and
restates the closing-balance derivation with the live numbers.

**Chart design.** Balances are faceted into one horizontal bar chart per category rather than a
single combined chart. Ammunition is counted in rounds and vehicles in units; on a shared
linear axis 42,000 rounds sets the scale and "3 M1 Abrams" renders as an invisible sliver. One
chart per category gives each a readable domain. The two series colours (`#6b8fd4` opening,
`#849433` closing) were validated against the `#0b1220` chart surface: inside the lightness
band, above the chroma floor, CVD separation ΔE 21.8 (protan), normal-vision ΔE 22.4, contrast
above 3:1. A `View balances as a table` disclosure gives the same numbers without the chart.

### Accessibility

Semantic landmarks · every input labelled via `Field`'s generated id, with `aria-invalid` and
`aria-describedby` on errors · visible focus ring on all interactive elements · modal has
`role="dialog"`, `aria-modal`, Escape-to-close and focus restore · errors announced with
`role="alert"` · wide tables scroll inside their own container so the page body never scrolls
sideways (verified 0px overflow at 390px) · `prefers-reduced-motion` respected · interactive
cards are buttons, not divs with a pointer cursor.

---

## 10. Testing

63 automated tests.

| Suite | Needs a database | Covers |
|---|---|---|
| `balance.test.js` | no | The inventory equation, sign handling, string aggregates, unknown movement types |
| `rbac.test.js` | no | Role gates, scope overwrite, write ownership, numeric comparison |
| `validate.test.js` | no | Type casting, operator-injection payloads, bounds, date handling, pagination cap |
| `api.integration.test.js` | yes (skips with a reason if absent) | Live HTTP against a real Postgres |

The integration suite covers: wrong password · operator-injection login · unauthenticated and
forged tokens · commander scope overwrite · every 403 in the matrix · the balance equation ·
no negative stock · purchase moves the dashboard by exactly its quantity · cross-base write
rejected · invalid body · unknown FK → 404 · transfer conserves the global total · overdraft
rolls back leaving no row · same-base transfer · expenditure overdraft · two concurrent
transfers where exactly one survives · audit entries for every mutation · denied-access
logging · unknown route · unknown id · oversized string · health check.

### Edge cases handled

Empty list on first load (empty states) · double submit (guarded on every form) · invalid or
missing id (404, not a crash) · unauthorised access to another base's record (403 + audit) ·
very long input (length bounds) · network failure (error state with retry) · refresh with an
expired token (clean sign-out) · inverted date range (the two date inputs clamp to each other)
· stale response from a superseded filter (discarded by key).

---

## 11. Setup and deployment

See [`../README.md`](../README.md) for the full quick start, environment variable tables and
the Vercel deployment steps. [`../PLAN.md`](../PLAN.md) records the serverless port's design
review: why one Node function rather than per-route functions or the Edge runtime, and the
connection-pooling constraints that follow from running on lambdas.

---

## 12. Sample test accounts

| Role | Username | Password | Base assigned |
|---|---|---|---|
| Admin | `admin_user` | `AdminPass123!` | All bases (global) |
| Base Commander | `commander_alpha` | `CommandPass123!` | Fort Alpha (Base #1) |
| Base Commander | `commander_bravo` | `CommandPass123!` | Camp Bravo (Base #2) |
| Logistics Officer | `logistics_officer` | `LogisticsPass123!` | Fort Alpha (Base #1) |

Seeded data: 3 bases · 8 equipment types across 4 categories · 25 purchases · 5 transfers ·
5 assignments · 4 expenditures. Movements sit deliberately on both sides of a 30-day boundary
so the opening balance and the net movement are both non-zero on first load — without both, the
headline equation cannot be demonstrated. The seed asserts that no base ends with negative
stock and fails loudly if it does.

---

## 13. Known limitations

| Limitation | Rationale |
|---|---|
| Transfers are created `COMPLETED`; `PENDING` / `IN_TRANSIT` / `CANCELLED` exist in the schema but no endpoint sets them | An in-transit state means stock belongs to neither base, which needs a third balance bucket. Not required by the brief |
| Assignments are not returnable | The brief models an assignment as a deduction. A return would be a new movement type in `asset_ledger` — the ledger is designed for it |
| Balances are computed per request | Correct and fast at this scale. If it stopped being fast the fix is a materialised view; the query shape is unchanged |
| JWT in `localStorage`, not an httpOnly cookie | The brief specifies "axios instance with auth interceptors". A cookie would be the stronger choice against XSS and is a drop-in change on both sides |
| No refresh tokens | An 8-hour token with a clean expiry path fits the assignment's session model |
