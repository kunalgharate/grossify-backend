-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "store_id" TEXT,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "settings_scope_store_id_idx" ON "settings"("scope", "store_id");

-- CreateIndex
CREATE UNIQUE INDEX "settings_scope_store_id_key_key" ON "settings"("scope", "store_id", "key");
