-- CreateTable
CREATE TABLE "store_staff" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'STAFF',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "invited_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_staff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "store_staff_user_id_idx" ON "store_staff"("user_id");

-- CreateIndex
CREATE INDEX "store_staff_store_id_status_idx" ON "store_staff"("store_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "store_staff_store_id_user_id_key" ON "store_staff"("store_id", "user_id");

-- AddForeignKey
ALTER TABLE "store_staff" ADD CONSTRAINT "store_staff_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_staff" ADD CONSTRAINT "store_staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
