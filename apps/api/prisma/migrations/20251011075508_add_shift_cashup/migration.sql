-- Table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ShiftCashup'
  ) THEN
    CREATE TABLE "ShiftCashup" (
      "id" SERIAL NOT NULL,
      "shiftId" INTEGER NOT NULL,
      "snapshot" JSONB NOT NULL,
      "note" TEXT,
      "submittedBy" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ShiftCashup_pkey" PRIMARY KEY ("id")
    );
  END IF;
END $$;

-- Unique (shiftId)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='ShiftCashup_shiftId_key'
  ) THEN
    CREATE UNIQUE INDEX "ShiftCashup_shiftId_key" ON "ShiftCashup"("shiftId");
  END IF;
END $$;

-- createdAt index
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='ShiftCashup_createdAt_idx'
  ) THEN
    CREATE INDEX "ShiftCashup_createdAt_idx" ON "ShiftCashup"("createdAt");
  END IF;
END $$;

-- Foreign key
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema='public'
      AND table_name='ShiftCashup'
      AND constraint_name='ShiftCashup_shiftId_fkey'
  ) THEN
    ALTER TABLE "ShiftCashup"
      ADD CONSTRAINT "ShiftCashup_shiftId_fkey"
      FOREIGN KEY ("shiftId") REFERENCES "Shift"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
