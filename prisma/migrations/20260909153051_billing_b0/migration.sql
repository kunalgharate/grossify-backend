-- CreateEnum
CREATE TYPE "VendorType" AS ENUM ('GROCERY', 'GENERAL_RETAIL', 'RESTAURANT');

-- CreateEnum
CREATE TYPE "GstScheme" AS ENUM ('REGULAR', 'COMPOSITION', 'UNREGISTERED');

-- CreateEnum
CREATE TYPE "StockValuation" AS ENUM ('FIFO', 'WEIGHTED_AVG');

-- CreateEnum
CREATE TYPE "OrderChannel" AS ENUM ('ONLINE', 'POS');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('DELIVERY', 'PICKUP', 'DINE_IN', 'TAKEAWAY', 'COUNTER');

-- CreateEnum
CREATE TYPE "InvoiceDocType" AS ENUM ('TAX_INVOICE', 'BILL_OF_SUPPLY', 'CREDIT_NOTE');

-- CreateEnum
CREATE TYPE "TenderMethod" AS ENUM ('CASH', 'CARD', 'UPI', 'WALLET', 'CREDIT', 'CHEQUE', 'RAZORPAY');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrderStatus" ADD VALUE 'HELD';
ALTER TYPE "OrderStatus" ADD VALUE 'DRAFT';

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_customer_id_fkey";

-- DropIndex
DROP INDEX "invoices_invoice_number_key";

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "ack_no" TEXT,
ADD COLUMN     "buyer_address" TEXT,
ADD COLUMN     "buyer_gstin" TEXT,
ADD COLUMN     "buyer_name" TEXT,
ADD COLUMN     "cess_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "doc_type" "InvoiceDocType" NOT NULL DEFAULT 'TAX_INVOICE',
ADD COLUMN     "eway_bill_number" TEXT,
ADD COLUMN     "financial_year" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "irn" TEXT,
ADD COLUMN     "irn_status" TEXT,
ADD COLUMN     "place_of_supply_state" INTEGER,
ADD COLUMN     "rate_wise_summary" JSONB,
ADD COLUMN     "reverse_charge" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "round_off" DECIMAL(4,2) NOT NULL DEFAULT 0,
ADD COLUMN     "signed_qr" TEXT,
ADD COLUMN     "taxable_value" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "total_cgst" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "total_igst" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "total_sgst" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "cess_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "cgst" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "discount_type" TEXT,
ADD COLUMN     "discount_value" DECIMAL(10,2),
ADD COLUMN     "hsn_sac" TEXT,
ADD COLUMN     "igst" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "is_tax_inclusive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "line_total" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "sgst" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "taxable_value" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "uqc" TEXT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "balance_due" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "bill_discount_type" TEXT,
ADD COLUMN     "bill_discount_value" DECIMAL(10,2),
ADD COLUMN     "cashier_id" TEXT,
ADD COLUMN     "channel" "OrderChannel" NOT NULL DEFAULT 'ONLINE',
ADD COLUMN     "customer_gstin" TEXT,
ADD COLUMN     "customer_name" TEXT,
ADD COLUMN     "customer_phone" TEXT,
ADD COLUMN     "order_type" "OrderType" NOT NULL DEFAULT 'DELIVERY',
ADD COLUMN     "pos_terminal_id" TEXT,
ADD COLUMN     "round_off" DECIMAL(4,2) NOT NULL DEFAULT 0,
ADD COLUMN     "service_charge_rate" DECIMAL(5,2),
ADD COLUMN     "service_mode" TEXT,
ADD COLUMN     "table_id" TEXT,
ADD COLUMN     "taxable_subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "total_cgst" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "total_igst" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "total_paid" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "total_sgst" DECIMAL(10,2) NOT NULL DEFAULT 0,
ALTER COLUMN "customer_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "gst_scheme" "GstScheme" NOT NULL DEFAULT 'UNREGISTERED',
ADD COLUMN     "restaurant_tax_profile" JSONB,
ADD COLUMN     "state_code" INTEGER,
ADD COLUMN     "stock_valuation" "StockValuation" NOT NULL DEFAULT 'WEIGHTED_AVG',
ADD COLUMN     "vendor_type" "VendorType" NOT NULL DEFAULT 'GENERAL_RETAIL';

-- CreateTable
CREATE TABLE "gst_rates" (
    "id" TEXT NOT NULL,
    "hsn_code" TEXT,
    "description" TEXT,
    "rate" DECIMAL(5,2) NOT NULL,
    "cess_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_until" TIMESTAMP(3),
    "regime" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "gst_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_series" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "financial_year" TEXT NOT NULL,
    "doc_type" "InvoiceDocType" NOT NULL DEFAULT 'TAX_INVOICE',
    "prefix" TEXT NOT NULL DEFAULT 'INV',
    "next_number" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "invoice_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_tenders" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "method" "TenderMethod" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "reference_number" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_tenders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gst_rates_effective_from_effective_until_idx" ON "gst_rates"("effective_from", "effective_until");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_series_store_id_financial_year_doc_type_key" ON "invoice_series"("store_id", "financial_year", "doc_type");

-- CreateIndex
CREATE INDEX "payment_tenders_order_id_idx" ON "payment_tenders"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_store_id_financial_year_invoice_number_key" ON "invoices"("store_id", "financial_year", "invoice_number");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_series" ADD CONSTRAINT "invoice_series_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_tenders" ADD CONSTRAINT "payment_tenders_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

