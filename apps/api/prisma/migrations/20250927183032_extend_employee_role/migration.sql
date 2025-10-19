-- Add CHEF if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'EmployeeRole' AND e.enumlabel = 'CHEF'
  ) THEN
    ALTER TYPE "EmployeeRole" ADD VALUE 'CHEF';
  END IF;
END $$;

-- Add CASHIER if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'EmployeeRole' AND e.enumlabel = 'CASHIER'
  ) THEN
    ALTER TYPE "EmployeeRole" ADD VALUE 'CASHIER';
  END IF;
END $$;

-- Add MANAGER if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'EmployeeRole' AND e.enumlabel = 'MANAGER'
  ) THEN
    ALTER TYPE "EmployeeRole" ADD VALUE 'MANAGER';
  END IF;
END $$;
