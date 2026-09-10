-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_customer_id_fkey";

-- AlterTable
ALTER TABLE "invoices" ALTER COLUMN "customer_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

