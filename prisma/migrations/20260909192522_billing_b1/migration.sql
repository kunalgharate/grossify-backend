-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "local_invoice_number" TEXT,
ADD COLUMN     "local_uuid" TEXT;

-- CreateTable
CREATE TABLE "printer_configs" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'BILL',
    "paper_width" TEXT NOT NULL DEFAULT 'MM_80',
    "chars_per_line" INTEGER NOT NULL DEFAULT 48,
    "connection_type" TEXT NOT NULL,
    "device_address" TEXT NOT NULL,
    "features" JSONB,
    "copies" INTEGER NOT NULL DEFAULT 1,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "station" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "printer_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "day_closes" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "terminal_id" TEXT,
    "business_date" TIMESTAMP(3) NOT NULL,
    "opening_cash" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_sales" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "cash_sales" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "card_sales" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "upi_sales" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "other_sales" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_tax" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "bill_count" INTEGER NOT NULL DEFAULT 0,
    "closed_by" TEXT NOT NULL,
    "closed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "day_closes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "printer_configs_store_id_role_idx" ON "printer_configs"("store_id", "role");

-- CreateIndex
CREATE INDEX "day_closes_store_id_business_date_idx" ON "day_closes"("store_id", "business_date");

-- CreateIndex
CREATE UNIQUE INDEX "orders_local_uuid_key" ON "orders"("local_uuid");

-- AddForeignKey
ALTER TABLE "printer_configs" ADD CONSTRAINT "printer_configs_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "day_closes" ADD CONSTRAINT "day_closes_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

