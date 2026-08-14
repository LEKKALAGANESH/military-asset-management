-- ============================================================================
--  Military Asset Management System — PostgreSQL schema
--  Run:  npm run db:schema     (or: psql "$DATABASE_URL" -f server/db/schema.sql)
--
--  Design note: stock levels are NEVER stored. Every quantity in the system is
--  derived from the immutable movement tables through the `asset_ledger` view,
--  so a balance can never drift out of sync with the records that produced it.
-- ============================================================================

BEGIN;

DROP VIEW  IF EXISTS assets            CASCADE;
DROP VIEW  IF EXISTS asset_ledger      CASCADE;
DROP TABLE IF EXISTS audit_logs        CASCADE;
DROP TABLE IF EXISTS expenditures      CASCADE;
DROP TABLE IF EXISTS assignments       CASCADE;
DROP TABLE IF EXISTS transfers         CASCADE;
DROP TABLE IF EXISTS purchases         CASCADE;
DROP TABLE IF EXISTS users             CASCADE;
DROP TABLE IF EXISTS equipment_types   CASCADE;
DROP TABLE IF EXISTS bases             CASCADE;

-- ---------------------------------------------------------------- reference

CREATE TABLE bases (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE,
    location    VARCHAR(150) NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE equipment_types (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE,   -- 'M4 Carbine', 'Humvee', '5.56mm Ammo'
    category    VARCHAR(50)  NOT NULL
                CHECK (category IN ('WEAPON', 'VEHICLE', 'AMMUNITION', 'EQUIPMENT')),
    unit        VARCHAR(20)  NOT NULL DEFAULT 'UNIT',
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
    id             SERIAL PRIMARY KEY,
    username       VARCHAR(50)  NOT NULL UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,
    full_name      VARCHAR(100) NOT NULL,
    role           VARCHAR(30)  NOT NULL
                   CHECK (role IN ('ADMIN', 'BASE_COMMANDER', 'LOGISTICS_OFFICER')),
    base_id        INT          REFERENCES bases(id) ON DELETE SET NULL,
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    -- A non-admin must be pinned to a base, otherwise base scoping has nothing to scope to.
    CONSTRAINT users_base_required CHECK (role = 'ADMIN' OR base_id IS NOT NULL)
);

-- --------------------------------------------------------- movement tables
-- `occurred_at` = when the event happened in the real world (filterable, back-datable).
-- `created_at`  = when the row was written (immutable audit fact).

CREATE TABLE purchases (
    id                 SERIAL PRIMARY KEY,
    base_id            INT NOT NULL REFERENCES bases(id)           ON DELETE RESTRICT,
    equipment_type_id  INT NOT NULL REFERENCES equipment_types(id) ON DELETE RESTRICT,
    quantity           INT NOT NULL CHECK (quantity > 0),
    unit_cost          NUMERIC(12, 2) CHECK (unit_cost IS NULL OR unit_cost >= 0),
    supplier           VARCHAR(150),
    occurred_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by         INT REFERENCES users(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE transfers (
    id                    SERIAL PRIMARY KEY,
    source_base_id        INT NOT NULL REFERENCES bases(id)           ON DELETE RESTRICT,
    destination_base_id   INT NOT NULL REFERENCES bases(id)           ON DELETE RESTRICT,
    equipment_type_id     INT NOT NULL REFERENCES equipment_types(id) ON DELETE RESTRICT,
    quantity              INT NOT NULL CHECK (quantity > 0),
    status                VARCHAR(20) NOT NULL DEFAULT 'COMPLETED'
                          CHECK (status IN ('PENDING', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED')),
    notes                 TEXT,
    occurred_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    initiated_by          INT REFERENCES users(id) ON DELETE SET NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT transfers_distinct_bases CHECK (source_base_id <> destination_base_id)
);

CREATE TABLE assignments (
    id                 SERIAL PRIMARY KEY,
    base_id            INT NOT NULL REFERENCES bases(id)           ON DELETE RESTRICT,
    equipment_type_id  INT NOT NULL REFERENCES equipment_types(id) ON DELETE RESTRICT,
    quantity           INT NOT NULL CHECK (quantity > 0),
    assigned_to        VARCHAR(120) NOT NULL,          -- personnel name
    personnel_rank     VARCHAR(50),
    purpose            TEXT,
    occurred_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by         INT REFERENCES users(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE expenditures (
    id                 SERIAL PRIMARY KEY,
    base_id            INT NOT NULL REFERENCES bases(id)           ON DELETE RESTRICT,
    equipment_type_id  INT NOT NULL REFERENCES equipment_types(id) ON DELETE RESTRICT,
    quantity           INT NOT NULL CHECK (quantity > 0),
    reason             VARCHAR(200) NOT NULL,          -- 'Training exercise', 'Combat operation'
    occurred_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by         INT REFERENCES users(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_logs (
    id           SERIAL PRIMARY KEY,
    user_id      INT REFERENCES users(id) ON DELETE SET NULL,
    username     VARCHAR(50),                -- denormalised so the trail survives user deletion
    action       VARCHAR(50)  NOT NULL,      -- PURCHASE | TRANSFER | ASSIGNMENT | EXPENDITURE | LOGIN | ACCESS_DENIED …
    entity       VARCHAR(50),
    entity_id    INT,
    details      TEXT         NOT NULL,
    ip_address   VARCHAR(64),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------ indexes
-- The high-cardinality filter columns: base_id, equipment_type_id, and the date columns.

CREATE INDEX idx_users_base                 ON users            (base_id);
CREATE INDEX idx_purchases_base_equipment   ON purchases        (base_id, equipment_type_id);
CREATE INDEX idx_purchases_occurred         ON purchases        (occurred_at DESC);
CREATE INDEX idx_transfers_source           ON transfers        (source_base_id, equipment_type_id);
CREATE INDEX idx_transfers_destination      ON transfers        (destination_base_id, equipment_type_id);
CREATE INDEX idx_transfers_occurred         ON transfers        (occurred_at DESC);
CREATE INDEX idx_assignments_base_equipment ON assignments      (base_id, equipment_type_id);
CREATE INDEX idx_assignments_occurred       ON assignments      (occurred_at DESC);
CREATE INDEX idx_expenditures_base_equip    ON expenditures     (base_id, equipment_type_id);
CREATE INDEX idx_expenditures_occurred      ON expenditures     (occurred_at DESC);
CREATE INDEX idx_audit_logs_created         ON audit_logs       (created_at DESC);
CREATE INDEX idx_audit_logs_user            ON audit_logs       (user_id);
CREATE INDEX idx_audit_logs_action          ON audit_logs       (action);

-- ------------------------------------------------------------------- views
-- Every stock movement in the system, normalised to a signed delta.
-- Transfers appear twice: +qty at the destination, -qty at the source.
-- Only COMPLETED transfers move stock; PENDING / IN_TRANSIT / CANCELLED do not.

CREATE VIEW asset_ledger AS
    SELECT id, base_id,             equipment_type_id, occurred_at,
           'PURCHASE'::VARCHAR(20)     AS movement_type,  quantity  AS delta, created_by AS actor_id
      FROM purchases
    UNION ALL
    SELECT id, destination_base_id, equipment_type_id, occurred_at,
           'TRANSFER_IN'::VARCHAR(20)  AS movement_type,  quantity  AS delta, initiated_by
      FROM transfers  WHERE status = 'COMPLETED'
    UNION ALL
    SELECT id, source_base_id,      equipment_type_id, occurred_at,
           'TRANSFER_OUT'::VARCHAR(20) AS movement_type, -quantity  AS delta, initiated_by
      FROM transfers  WHERE status = 'COMPLETED'
    UNION ALL
    SELECT id, base_id,             equipment_type_id, occurred_at,
           'ASSIGNMENT'::VARCHAR(20)   AS movement_type, -quantity  AS delta, created_by
      FROM assignments
    UNION ALL
    SELECT id, base_id,             equipment_type_id, occurred_at,
           'EXPENDITURE'::VARCHAR(20)  AS movement_type, -quantity  AS delta, created_by
      FROM expenditures;

-- The `assets` entity: current holdings per base per equipment type, derived not stored.
CREATE VIEW assets AS
    SELECT l.base_id,
           b.name                    AS base_name,
           l.equipment_type_id,
           e.name                    AS equipment_name,
           e.category,
           e.unit,
           COALESCE(SUM(l.delta), 0)::INT AS quantity,
           MAX(l.occurred_at)        AS last_movement_at
      FROM asset_ledger l
      JOIN bases           b ON b.id = l.base_id
      JOIN equipment_types e ON e.id = l.equipment_type_id
     GROUP BY l.base_id, b.name, l.equipment_type_id, e.name, e.category, e.unit;

COMMIT;
