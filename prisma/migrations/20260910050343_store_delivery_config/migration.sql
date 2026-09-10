-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "delivery_mode" TEXT NOT NULL DEFAULT 'SELF',
ADD COLUMN     "free_delivery_above" DECIMAL(10,2),
ADD COLUMN     "min_delivery_fee_per_side" DECIMAL(10,2) NOT NULL DEFAULT 20;

