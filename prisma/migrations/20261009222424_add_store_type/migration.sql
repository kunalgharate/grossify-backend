-- Additive + idempotent: StoreType enum + stores.store_type column (default B2C).
DO $$ BEGIN
  CREATE TYPE "StoreType" AS ENUM ('B2C', 'B2B');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "store_type" "StoreType" NOT NULL DEFAULT 'B2C';
