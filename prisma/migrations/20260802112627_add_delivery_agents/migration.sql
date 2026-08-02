-- CreateTable
CREATE TABLE "delivery_agents" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "vehicle_type" TEXT NOT NULL,
    "vehicle_number" TEXT,
    "license_number" TEXT,
    "aadhaar_number" TEXT,
    "pan_number" TEXT,
    "documents" JSONB,
    "bank_account_name" TEXT,
    "bank_account_number" TEXT,
    "bank_ifsc" TEXT,
    "service_radius" INTEGER NOT NULL DEFAULT 5000,
    "is_online" BOOLEAN NOT NULL DEFAULT false,
    "current_lat" DECIMAL(10,8),
    "current_lng" DECIMAL(11,8),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_agents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "delivery_agents_user_id_key" ON "delivery_agents"("user_id");

-- AddForeignKey
ALTER TABLE "delivery_agents" ADD CONSTRAINT "delivery_agents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
