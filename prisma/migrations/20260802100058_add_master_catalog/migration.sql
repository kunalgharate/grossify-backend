-- CreateTable
CREATE TABLE "master_products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "brand" TEXT,
    "description" TEXT,
    "mrp" DECIMAL(10,2) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'piece',
    "barcode" TEXT,
    "hsn" TEXT,
    "images" TEXT[],
    "attributes" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "master_products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "master_products_slug_key" ON "master_products"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "master_products_barcode_key" ON "master_products"("barcode");

-- CreateIndex
CREATE INDEX "master_products_category_id_idx" ON "master_products"("category_id");

-- AddForeignKey
ALTER TABLE "master_products" ADD CONSTRAINT "master_products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
