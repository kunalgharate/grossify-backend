-- CreateTable
CREATE TABLE "delivery_earnings" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "agent_id" TEXT,
    "pool" DECIMAL(10,2) NOT NULL,
    "store_share" DECIMAL(10,2) NOT NULL,
    "customer_share" DECIMAL(10,2) NOT NULL,
    "platform_commission" DECIMAL(10,2) NOT NULL,
    "partner_payout" DECIMAL(10,2) NOT NULL,
    "is_free" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "settled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_earnings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "delivery_earnings_order_id_key" ON "delivery_earnings"("order_id");

-- CreateIndex
CREATE INDEX "delivery_earnings_agent_id_status_idx" ON "delivery_earnings"("agent_id", "status");

-- CreateIndex
CREATE INDEX "delivery_earnings_store_id_status_idx" ON "delivery_earnings"("store_id", "status");

-- AddForeignKey
ALTER TABLE "delivery_earnings" ADD CONSTRAINT "delivery_earnings_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_earnings" ADD CONSTRAINT "delivery_earnings_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_earnings" ADD CONSTRAINT "delivery_earnings_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

