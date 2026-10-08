-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "ack_due_at" TIMESTAMP(3),
ADD COLUMN     "acknowledged_at" TIMESTAMP(3),
ADD COLUMN     "is_grievance" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "resolve_due_at" TIMESTAMP(3),
ADD COLUMN     "sla_status" TEXT;

-- CreateTable
CREATE TABLE "policy_versions" (
    "id" TEXT NOT NULL,
    "policy_type" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "effective_at" TIMESTAMP(3) NOT NULL,
    "material_change" BOOLEAN NOT NULL DEFAULT false,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_acceptances" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "policy_type" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT false,
    "granted_at" TIMESTAMP(3),
    "withdrawn_at" TIMESTAMP(3),

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_rights_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "result_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "data_rights_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "policy_versions_policy_type_is_current_idx" ON "policy_versions"("policy_type", "is_current");

-- CreateIndex
CREATE INDEX "policy_acceptances_user_id_policy_type_idx" ON "policy_acceptances"("user_id", "policy_type");

-- CreateIndex
CREATE INDEX "consent_records_user_id_purpose_idx" ON "consent_records"("user_id", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "consent_records_user_id_purpose_key" ON "consent_records"("user_id", "purpose");

-- CreateIndex
CREATE INDEX "data_rights_requests_user_id_type_idx" ON "data_rights_requests"("user_id", "type");

-- AddForeignKey
ALTER TABLE "policy_acceptances" ADD CONSTRAINT "policy_acceptances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_rights_requests" ADD CONSTRAINT "data_rights_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
