-- AlterTable
ALTER TABLE "products" ADD COLUMN     "food_type" TEXT,
ADD COLUMN     "prep_station" TEXT,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'PRODUCT';

-- CreateTable
CREATE TABLE "modifier_groups" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "product_id" TEXT,
    "name" TEXT NOT NULL,
    "min_select" INTEGER NOT NULL DEFAULT 0,
    "max_select" INTEGER NOT NULL DEFAULT 1,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "modifier_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modifiers" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price_delta" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "modifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_tables" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "section" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 4,
    "status" TEXT NOT NULL DEFAULT 'free',
    "current_order_id" TEXT,

    CONSTRAINT "restaurant_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kots" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "kot_number" TEXT NOT NULL,
    "station" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "printed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kot_items" (
    "id" TEXT NOT NULL,
    "kot_id" TEXT NOT NULL,
    "menu_item_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "modifiers" TEXT[],
    "notes" TEXT,

    CONSTRAINT "kot_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "modifier_groups_store_id_idx" ON "modifier_groups"("store_id");

-- CreateIndex
CREATE INDEX "modifier_groups_product_id_idx" ON "modifier_groups"("product_id");

-- CreateIndex
CREATE INDEX "restaurant_tables_store_id_status_idx" ON "restaurant_tables"("store_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_tables_store_id_name_key" ON "restaurant_tables"("store_id", "name");

-- CreateIndex
CREATE INDEX "kots_store_id_status_idx" ON "kots"("store_id", "status");

-- CreateIndex
CREATE INDEX "kots_order_id_idx" ON "kots"("order_id");

-- AddForeignKey
ALTER TABLE "modifier_groups" ADD CONSTRAINT "modifier_groups_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifier_groups" ADD CONSTRAINT "modifier_groups_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifiers" ADD CONSTRAINT "modifiers_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "modifier_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_tables" ADD CONSTRAINT "restaurant_tables_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kots" ADD CONSTRAINT "kots_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kots" ADD CONSTRAINT "kots_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kot_items" ADD CONSTRAINT "kot_items_kot_id_fkey" FOREIGN KEY ("kot_id") REFERENCES "kots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

