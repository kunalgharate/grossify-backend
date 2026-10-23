-- CreateEnum
CREATE TYPE "Status" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('active', 'inactive', 'pending_approval', 'suspended');

-- CreateEnum
CREATE TYPE "UserRoleInOrg" AS ENUM ('owner', 'admin', 'buyer', 'approver', 'viewer', 'sales_rep');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired', 'converted');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('pending', 'approved', 'rejected', 'escalated');

-- CreateEnum
CREATE TYPE "CreditStatus" AS ENUM ('active', 'on_hold', 'suspended', 'closed');

-- CreateEnum
CREATE TYPE "PriceListType" AS ENUM ('standard', 'customer_specific', 'volume', 'promotional', 'contract');

-- AlterTable
ALTER TABLE "master_products" ADD COLUMN     "approved_at" TIMESTAMP(3),
ADD COLUMN     "approved_by" TEXT,
ADD COLUMN     "status" "Status" NOT NULL DEFAULT 'pending';

-- CreateTable
CREATE TABLE "customer_organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legal_name" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'active',
    "website" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "billing_address" JSONB,
    "shipping_address" JSONB,
    "credit_limit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "credit_used" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "payment_terms" INTEGER NOT NULL DEFAULT 30,
    "tax_exempt" BOOLEAN NOT NULL DEFAULT false,
    "tax_exempt_cert" TEXT,
    "parent_org_id" TEXT,
    "assigned_rep_id" TEXT,
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_units" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "address" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_organization_users" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "business_unit_id" TEXT,
    "role" "UserRoleInOrg" NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "approved_at" TIMESTAMP(3),
    "approved_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_organization_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_lists" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "PriceListType" NOT NULL DEFAULT 'standard',
    "organization_id" TEXT,
    "business_unit_id" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "valid_from" TIMESTAMP(3),
    "valid_until" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_list_items" (
    "id" TEXT NOT NULL,
    "price_list_id" TEXT NOT NULL,
    "product_id" TEXT,
    "variant_id" TEXT,
    "category_id" TEXT,
    "master_product_id" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "min_qty" INTEGER NOT NULL DEFAULT 1,
    "max_qty" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "valid_from" TIMESTAMP(3),
    "valid_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_list_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "quote_number" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "business_unit_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "assigned_rep_id" TEXT,
    "assigned_sales_rep_id" TEXT,
    "status" "QuoteStatus" NOT NULL DEFAULT 'draft',
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "valid_until" TIMESTAMP(3),
    "notes" TEXT,
    "terms" TEXT,
    "approved_at" TIMESTAMP(3),
    "approved_by" TEXT,
    "rejected_at" TIMESTAMP(3),
    "rejected_by" TEXT,
    "rejected_reason" TEXT,
    "converted_order_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_items" (
    "id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "product_id" TEXT,
    "variant_id" TEXT,
    "master_product_id" TEXT,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "description" TEXT,
    "quantity" INTEGER NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'piece',
    "unit_price" DECIMAL(10,2) NOT NULL,
    "discount_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "discount_amt" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(12,2) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quote_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_workflows" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "organization_id" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'pending',
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "initiated_by" TEXT NOT NULL,
    "decided_by" TEXT,
    "decided_at" TIMESTAMP(3),
    "decision_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_steps" (
    "id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "step_order" INTEGER NOT NULL,
    "approver_role" TEXT,
    "approver_user_id" TEXT,
    "approver_org_id" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'pending',
    "decided_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corporate_accounts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "credit_limit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "credit_used" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "available_credit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "payment_terms_days" INTEGER NOT NULL DEFAULT 30,
    "credit_status" "CreditStatus" NOT NULL DEFAULT 'active',
    "last_reviewed_at" TIMESTAMP(3),
    "reviewed_by" TEXT,
    "auto_hold_on_overdue" BOOLEAN NOT NULL DEFAULT true,
    "max_overdue_days" INTEGER NOT NULL DEFAULT 60,
    "interest_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "corporate_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_reps" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "employee_id" TEXT,
    "territory_id" TEXT,
    "manager_id" TEXT,
    "commission_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "target_monthly" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "hire_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_reps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "territories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "parent_id" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "territories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_catalogs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "business_unit_id" TEXT,
    "category_id" TEXT,
    "product_id" TEXT,
    "master_product_id" TEXT,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "custom_price" DECIMAL(10,2),
    "min_order_qty" INTEGER NOT NULL DEFAULT 1,
    "max_order_qty" INTEGER,
    "valid_from" TIMESTAMP(3),
    "valid_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_catalogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_SalesRepOrgs" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_organizations_gstin_key" ON "customer_organizations"("gstin");

-- CreateIndex
CREATE UNIQUE INDEX "customer_organizations_pan_key" ON "customer_organizations"("pan");

-- CreateIndex
CREATE INDEX "customer_organizations_status_idx" ON "customer_organizations"("status");

-- CreateIndex
CREATE INDEX "customer_organizations_parent_org_id_idx" ON "customer_organizations"("parent_org_id");

-- CreateIndex
CREATE INDEX "customer_organizations_assigned_rep_id_idx" ON "customer_organizations"("assigned_rep_id");

-- CreateIndex
CREATE INDEX "business_units_organization_id_idx" ON "business_units"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "business_units_organization_id_name_key" ON "business_units"("organization_id", "name");

-- CreateIndex
CREATE INDEX "customer_organization_users_user_id_idx" ON "customer_organization_users"("user_id");

-- CreateIndex
CREATE INDEX "customer_organization_users_organization_id_isActive_idx" ON "customer_organization_users"("organization_id", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "customer_organization_users_organization_id_user_id_key" ON "customer_organization_users"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "price_lists_organization_id_isActive_idx" ON "price_lists"("organization_id", "isActive");

-- CreateIndex
CREATE INDEX "price_lists_business_unit_id_isActive_idx" ON "price_lists"("business_unit_id", "isActive");

-- CreateIndex
CREATE INDEX "price_lists_type_isActive_idx" ON "price_lists"("type", "isActive");

-- CreateIndex
CREATE INDEX "price_list_items_price_list_id_isActive_idx" ON "price_list_items"("price_list_id", "isActive");

-- CreateIndex
CREATE INDEX "price_list_items_product_id_isActive_idx" ON "price_list_items"("product_id", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "price_list_items_price_list_id_product_id_variant_id_catego_key" ON "price_list_items"("price_list_id", "product_id", "variant_id", "category_id", "master_product_id", "min_qty");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_quote_number_key" ON "quotes"("quote_number");

-- CreateIndex
CREATE INDEX "quotes_organization_id_status_idx" ON "quotes"("organization_id", "status");

-- CreateIndex
CREATE INDEX "quotes_assigned_rep_id_status_idx" ON "quotes"("assigned_rep_id", "status");

-- CreateIndex
CREATE INDEX "quotes_created_by_id_idx" ON "quotes"("created_by_id");

-- CreateIndex
CREATE INDEX "quote_items_quote_id_idx" ON "quote_items"("quote_id");

-- CreateIndex
CREATE INDEX "approval_workflows_entityType_entityId_idx" ON "approval_workflows"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "approval_workflows_organization_id_status_idx" ON "approval_workflows"("organization_id", "status");

-- CreateIndex
CREATE INDEX "approval_steps_workflow_id_status_idx" ON "approval_steps"("workflow_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "approval_steps_workflow_id_step_order_key" ON "approval_steps"("workflow_id", "step_order");

-- CreateIndex
CREATE UNIQUE INDEX "corporate_accounts_organization_id_key" ON "corporate_accounts"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_reps_user_id_key" ON "sales_reps"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_reps_employee_id_key" ON "sales_reps"("employee_id");

-- CreateIndex
CREATE INDEX "sales_reps_territory_id_isActive_idx" ON "sales_reps"("territory_id", "isActive");

-- CreateIndex
CREATE INDEX "sales_reps_manager_id_idx" ON "sales_reps"("manager_id");

-- CreateIndex
CREATE UNIQUE INDEX "territories_code_key" ON "territories"("code");

-- CreateIndex
CREATE INDEX "territories_parent_id_idx" ON "territories"("parent_id");

-- CreateIndex
CREATE INDEX "customer_catalogs_organization_id_isVisible_idx" ON "customer_catalogs"("organization_id", "isVisible");

-- CreateIndex
CREATE INDEX "customer_catalogs_product_id_isVisible_idx" ON "customer_catalogs"("product_id", "isVisible");

-- CreateIndex
CREATE UNIQUE INDEX "customer_catalogs_organization_id_business_unit_id_category_key" ON "customer_catalogs"("organization_id", "business_unit_id", "category_id", "product_id", "master_product_id");

-- CreateIndex
CREATE UNIQUE INDEX "_SalesRepOrgs_AB_unique" ON "_SalesRepOrgs"("A", "B");

-- CreateIndex
CREATE INDEX "_SalesRepOrgs_B_index" ON "_SalesRepOrgs"("B");

-- AddForeignKey
ALTER TABLE "customer_organizations" ADD CONSTRAINT "customer_organizations_parent_org_id_fkey" FOREIGN KEY ("parent_org_id") REFERENCES "customer_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_organizations" ADD CONSTRAINT "customer_organizations_assigned_rep_id_fkey" FOREIGN KEY ("assigned_rep_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_units" ADD CONSTRAINT "business_units_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "customer_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_organization_users" ADD CONSTRAINT "customer_organization_users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "customer_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_organization_users" ADD CONSTRAINT "customer_organization_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_organization_users" ADD CONSTRAINT "customer_organization_users_business_unit_id_fkey" FOREIGN KEY ("business_unit_id") REFERENCES "business_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "customer_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_business_unit_id_fkey" FOREIGN KEY ("business_unit_id") REFERENCES "business_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "price_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_master_product_id_fkey" FOREIGN KEY ("master_product_id") REFERENCES "master_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "customer_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_business_unit_id_fkey" FOREIGN KEY ("business_unit_id") REFERENCES "business_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_assigned_rep_id_fkey" FOREIGN KEY ("assigned_rep_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_assigned_sales_rep_id_fkey" FOREIGN KEY ("assigned_sales_rep_id") REFERENCES "sales_reps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_master_product_id_fkey" FOREIGN KEY ("master_product_id") REFERENCES "master_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_workflows" ADD CONSTRAINT "approval_workflows_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "approval_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_approver_user_id_fkey" FOREIGN KEY ("approver_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_approver_org_id_fkey" FOREIGN KEY ("approver_org_id") REFERENCES "customer_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corporate_accounts" ADD CONSTRAINT "corporate_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "customer_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_reps" ADD CONSTRAINT "sales_reps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_reps" ADD CONSTRAINT "sales_reps_territory_id_fkey" FOREIGN KEY ("territory_id") REFERENCES "territories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_reps" ADD CONSTRAINT "sales_reps_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "sales_reps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "territories" ADD CONSTRAINT "territories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "territories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_catalogs" ADD CONSTRAINT "customer_catalogs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "customer_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_catalogs" ADD CONSTRAINT "customer_catalogs_business_unit_id_fkey" FOREIGN KEY ("business_unit_id") REFERENCES "business_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_catalogs" ADD CONSTRAINT "customer_catalogs_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_catalogs" ADD CONSTRAINT "customer_catalogs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_catalogs" ADD CONSTRAINT "customer_catalogs_master_product_id_fkey" FOREIGN KEY ("master_product_id") REFERENCES "master_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SalesRepOrgs" ADD CONSTRAINT "_SalesRepOrgs_A_fkey" FOREIGN KEY ("A") REFERENCES "customer_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SalesRepOrgs" ADD CONSTRAINT "_SalesRepOrgs_B_fkey" FOREIGN KEY ("B") REFERENCES "sales_reps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
