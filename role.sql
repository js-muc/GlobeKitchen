DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserRole') THEN
    CREATE TYPE "UserRole" AS ENUM ('ADMIN','STAFF');
  END IF;
END $$;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS role "UserRole" DEFAULT 'STAFF';

UPDATE "User" SET role='ADMIN' WHERE email='admin@globekitchen.local';
