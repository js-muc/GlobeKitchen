-- Enums (create if missing)
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

-- Shift table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_name = 'Shift' AND table_schema = 'public') THEN
    CREATE TABLE "Shift" (
      "id" SERIAL NOT NULL,
      "date" DATE NOT NULL,
      "employeeId" INTEGER NOT NULL,
      "waiterType" "WaiterType" NOT NULL,
      "openedAt" TIMESTAMP(3) NOT NULL,
      "closedAt" TIMESTAMP(3),
      "openingFloat" DECIMAL(12,2),
      "notes" TEXT,
      "tableCode" TEXT,
      "route" TEXT,
      "grossSales" DECIMAL(12,2) NOT NULL DEFAULT 0,
      "discounts" DECIMAL(12,2) NOT NULL DEFAULT 0,
      "returnsValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
      "netSales" DECIMAL(12,2) NOT NULL DEFAULT 0,
      "cashRemit" DECIMAL(12,2) NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
    );
  END IF;
END $$;

-- SaleLine table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_name = 'SaleLine' AND table_schema = 'public') THEN
    CREATE TABLE "SaleLine" (
      "id" SERIAL NOT NULL,
      "shiftId" INTEGER NOT NULL,
      "date" DATE NOT NULL,
      "itemId" INTEGER NOT NULL,
      "qty" DECIMAL(12,2) NOT NULL,
      "unit" TEXT NOT NULL,
      "unitPrice" DECIMAL(12,2) NOT NULL,
      "total" DECIMAL(12,2) NOT NULL,
      "tableCode" TEXT,
      "note" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "SaleLine_pkey" PRIMARY KEY ("id")
    );
  END IF;
END $$;

-- StockAdj table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_name = 'StockAdj' AND table_schema = 'public') THEN
    CREATE TABLE "StockAdj" (
      "id" SERIAL NOT NULL,
      "shiftId" INTEGER NOT NULL,
      "date" DATE NOT NULL,
      "itemId" INTEGER NOT NULL,
      "kind" "StockAdjKind" NOT NULL,
      "qty" DECIMAL(12,2) NOT NULL,
      "unit" TEXT NOT NULL,
      "unitCost" DECIMAL(12,2),
      "note" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "StockAdj_pkey" PRIMARY KEY ("id")
    );
  END IF;
END $$;

-- Indexes (create if missing)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='Shift_date_employeeId_idx'
  ) THEN
    CREATE INDEX "Shift_date_employeeId_idx" ON "Shift"("date", "employeeId");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='SaleLine_shiftId_date_idx'
  ) THEN
    CREATE INDEX "SaleLine_shiftId_date_idx" ON "SaleLine"("shiftId", "date");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='StockAdj_shiftId_date_idx'
  ) THEN
    CREATE INDEX "StockAdj_shiftId_date_idx" ON "StockAdj"("shiftId", "date");
  END IF;
END $$;

-- Foreign keys (add if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'SaleLine_shiftId_fkey' AND table_name = 'SaleLine'
  ) THEN
    ALTER TABLE "SaleLine"
      ADD CONSTRAINT "SaleLine_shiftId_fkey"
      FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'StockAdj_shiftId_fkey' AND table_name = 'StockAdj'
  ) THEN
    ALTER TABLE "StockAdj"
      ADD CONSTRAINT "StockAdj_shiftId_fkey"
      FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
