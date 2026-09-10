-- CreateEnum
CREATE TYPE "InventoryTxnType" AS ENUM ('PURCHASE_IN', 'SALE_OUT', 'ADJUSTMENT', 'WASTAGE', 'RETURN_IN', 'RETURN_OUT', 'TRANSFER');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "barcode_type" TEXT,
ADD COLUMN     "cost_price" DECIMAL(10,2),
ADD COLUMN     "reorder_level" INTEGER,
ADD COLUMN     "tax_rate" DECIMAL(5,2),
ADD COLUMN     "track_batch" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "track_inventory" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "track_serial" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "inventory_transactions" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "batch_id" TEXT,
    "type" "InventoryTxnType" NOT NULL,
    "qty_delta" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "unit_cost" DECIMAL(10,2),
    "reference_type" TEXT,
    "reference_id" TEXT,
    "reason" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gstin" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "state_code" INTEGER,
    "outstanding_payable" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "po_number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "expected_date" TIMESTAMP(3),
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "po_items" (
    "id" TEXT NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "cost_price" DECIMAL(10,2) NOT NULL,
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "qty_received" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "po_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "purchase_order_id" TEXT,
    "grn_number" TEXT NOT NULL,
    "received_by" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grn_items" (
    "id" TEXT NOT NULL,
    "goods_receipt_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "batch_number" TEXT,
    "expiry_date" TIMESTAMP(3),
    "mfg_date" TIMESTAMP(3),
    "qty_received" INTEGER NOT NULL,
    "cost_price" DECIMAL(10,2) NOT NULL,
    "mrp" DECIMAL(10,2),

    CONSTRAINT "grn_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_batches" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "batch_number" TEXT NOT NULL,
    "expiry_date" TIMESTAMP(3),
    "mfg_date" TIMESTAMP(3),
    "cost_price" DECIMAL(10,2) NOT NULL,
    "mrp" DECIMAL(10,2),
    "qty_remaining" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_transactions_store_id_product_id_created_at_idx" ON "inventory_transactions"("store_id", "product_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "inventory_transactions_reference_type_reference_id_idx" ON "inventory_transactions"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "suppliers_store_id_idx" ON "suppliers"("store_id");

-- CreateIndex
CREATE INDEX "purchase_orders_store_id_status_idx" ON "purchase_orders"("store_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_store_id_po_number_key" ON "purchase_orders"("store_id", "po_number");

-- CreateIndex
CREATE INDEX "goods_receipts_store_id_idx" ON "goods_receipts"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_store_id_grn_number_key" ON "goods_receipts"("store_id", "grn_number");

-- CreateIndex
CREATE INDEX "stock_batches_store_id_product_id_expiry_date_idx" ON "stock_batches"("store_id", "product_id", "expiry_date");

-- CreateIndex
CREATE INDEX "products_store_id_barcode_idx" ON "products"("store_id", "barcode");

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "stock_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_items" ADD CONSTRAINT "po_items_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_items" ADD CONSTRAINT "po_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_items" ADD CONSTRAINT "grn_items_goods_receipt_id_fkey" FOREIGN KEY ("goods_receipt_id") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_items" ADD CONSTRAINT "grn_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

