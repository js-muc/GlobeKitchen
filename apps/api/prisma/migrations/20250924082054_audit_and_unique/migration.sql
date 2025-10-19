-- =========================
-- PATCH: align DB to schema
-- =========================

-- 1) Extend EmployeeRole enum (idempotent-style guard)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t
                 JOIN pg_enum e ON t.oid = e.enumtypid
                 WHERE t.typname = 'EmployeeRole' AND e.enumlabel = 'CHEF') THEN
    ALTER TYPE "EmployeeRole" ADD VALUE 'CHEF';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type t
                 JOIN pg_enum e ON t.oid = e.enumtypid
                 WHERE t.typname = 'EmployeeRole' AND e.enumlabel = 'CASHIER') THEN
    ALTER TYPE "EmployeeRole" ADD VALUE 'CASHIER';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type t
                 JOIN pg_enum e ON t.oid = e.enumtypid
                 WHERE t.typname = 'EmployeeRole' AND e.enumlabel = 'MANAGER') THEN
    ALTER TYPE "EmployeeRole" ADD VALUE 'MANAGER';
  END IF;
END $$;

-- 2) Create daily-sales enums if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WaiterType') THEN
    CREATE TYPE "WaiterType" AS ENUM ('INSIDE', 'FIELD');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StockAdjKind') THEN
    CREATE TYPE "StockAdjKind" AS ENUM ('TAKE', 'ADD', 'RETURN');
  END IF;
END $$;

-- 3) Shift table
CREATE TABLE IF NOT EXISTS "Shift" (
  "id"            SERIAL PRIMARY KEY,
  "date"          DATE NOT NULL,
  "employeeId"    INTEGER NOT NULL,
  "waiterType"    "WaiterType" NOT NULL,
  "openedAt"      TIMESTAMP(3) NOT NULL,
  "closedAt"      TIMESTAMP(3),
  "openingFloat"  DECIMAL(12,2),
  "notes"         TEXT,
  "tableCode"     TEXT,              -- free-form; UI may send A6/A7
  "route"         TEXT,
  "grossSales"    DECIMAL(12,2) NOT NULL DEFAULT 0,
  "discounts"     DECIMAL(12,2) NOT NULL DEFAULT 0,
  "returnsValue"  DECIMAL(12,2) NOT NULL DEFAULT 0,
  "netSales"      DECIMAL(12,2) NOT NULL DEFAULT 0,
  "cashRemit"     DECIMAL(12,2) NOT NULL DEFAULT 0,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- FK: Shift.employeeId -> Employee(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Shift_employeeId_fkey'
      AND table_name = 'Shift'
  ) THEN
    ALTER TABLE "Shift"
      ADD CONSTRAINT "Shift_employeeId_fkey"
      FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- indexes for hot filters
CREATE INDEX IF NOT EXISTS "Shift_date_employeeId_idx" ON "Shift"("date","employeeId");
CREATE INDEX IF NOT EXISTS "Shift_date_waiterType_idx" ON "Shift"("date","waiterType");

-- 4) SaleLine table
CREATE TABLE IF NOT EXISTS "SaleLine" (
  "id"         SERIAL PRIMARY KEY,
  "shiftId"    INTEGER NOT NULL,
  "date"       DATE NOT NULL,
  "itemId"     INTEGER NOT NULL,
  "qty"        DECIMAL(12,2) NOT NULL,
  "unit"       TEXT NOT NULL,
  "unitPrice"  DECIMAL(12,2) NOT NULL,
  "total"      DECIMAL(12,2) NOT NULL,
  "tableCode"  TEXT,
  "note"       TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- FKs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'SaleLine_shiftId_fkey'
      AND table_name = 'SaleLine'
  ) THEN
    ALTER TABLE "SaleLine"
      ADD CONSTRAINT "SaleLine_shiftId_fkey"
      FOREIGN KEY ("shiftId") REFERENCES "Shift"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'SaleLine_itemId_fkey'
      AND table_name = 'SaleLine'
  ) THEN
    ALTER TABLE "SaleLine"
      ADD CONSTRAINT "SaleLine_itemId_fkey"
      FOREIGN KEY ("itemId") REFERENCES "MenuItem"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- indexes
CREATE INDEX IF NOT EXISTS "SaleLine_shiftId_date_idx" ON "SaleLine"("shiftId","date");
CREATE INDEX IF NOT EXISTS "SaleLine_itemId_idx"       ON "SaleLine"("itemId");

-- 5) StockAdj table
CREATE TABLE IF NOT EXISTS "StockAdj" (
  "id"         SERIAL PRIMARY KEY,
  "shiftId"    INTEGER NOT NULL,
  "date"       DATE NOT NULL,
  "itemId"     INTEGER NOT NULL,
  "kind"       "StockAdjKind" NOT NULL,
  "qty"        DECIMAL(12,2) NOT NULL,
  "unit"       TEXT NOT NULL,
  "unitCost"   DECIMAL(12,2),
  "note"       TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- FKs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'StockAdj_shiftId_fkey'
      AND table_name = 'StockAdj'
  ) THEN
    ALTER TABLE "StockAdj"
      ADD CONSTRAINT "StockAdj_shiftId_fkey"
      FOREIGN KEY ("shiftId") REFERENCES "Shift"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'StockAdj_itemId_fkey'
      AND table_name = 'StockAdj'
  ) THEN
    ALTER TABLE "StockAdj"
      ADD CONSTRAINT "StockAdj_itemId_fkey"
      FOREIGN KEY ("itemId") REFERENCES "MenuItem"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- indexes
CREATE INDEX IF NOT EXISTS "StockAdj_shiftId_date_idx" ON "StockAdj"("shiftId","date");
CREATE INDEX IF NOT EXISTS "StockAdj_itemId_idx"       ON "StockAdj"("itemId");

-- 6) ShiftCashup table (one-per-shift)
CREATE TABLE IF NOT EXISTS "ShiftCashup" (
  "id"          SERIAL PRIMARY KEY,
  "shiftId"     INTEGER NOT NULL UNIQUE,
  "snapshot"    JSONB NOT NULL,
  "note"        TEXT,
  "submittedBy" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ShiftCashup_shiftId_fkey'
      AND table_name = 'ShiftCashup'
  ) THEN
    ALTER TABLE "ShiftCashup"
      ADD CONSTRAINT "ShiftCashup_shiftId_fkey"
      FOREIGN KEY ("shiftId") REFERENCES "Shift"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ShiftCashup_createdAt_idx" ON "ShiftCashup"("createdAt");

-- 7) updatedAt auto-maintenance (optional but handy if you update via SQL)
-- If you rely solely on Prisma's @updatedAt, you can skip this trigger.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $t$
    BEGIN
      NEW."updatedAt" = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $t$ LANGUAGE plpgsql;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'tr_shift_set_updated_at'
  ) THEN
    CREATE TRIGGER tr_shift_set_updated_at
      BEFORE UPDATE ON "Shift"
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;
