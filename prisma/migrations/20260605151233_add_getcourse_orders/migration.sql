-- CreateTable
CREATE TABLE "getcourse_orders" (
    "id" TEXT NOT NULL,
    "gc_order_id" TEXT NOT NULL,
    "gc_number" TEXT,
    "gc_user_id" TEXT,
    "customer_name" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "composition" TEXT,
    "status" TEXT,
    "amount" DECIMAL(12,2),
    "amount_paid" DECIMAL(12,2),
    "currency" TEXT DEFAULT 'RUB',
    "payment_method" TEXT,
    "gc_created_at" TIMESTAMP(3),
    "gc_paid_at" TIMESTAMP(3),
    "user_id" TEXT,
    "data" JSONB NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "getcourse_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "getcourse_orders_gc_order_id_key" ON "getcourse_orders"("gc_order_id");

-- CreateIndex
CREATE INDEX "getcourse_orders_email_idx" ON "getcourse_orders"("email");

-- CreateIndex
CREATE INDEX "getcourse_orders_user_id_idx" ON "getcourse_orders"("user_id");

-- CreateIndex
CREATE INDEX "getcourse_orders_status_idx" ON "getcourse_orders"("status");

-- CreateIndex
CREATE INDEX "getcourse_orders_gc_created_at_idx" ON "getcourse_orders"("gc_created_at");

-- AddForeignKey
ALTER TABLE "getcourse_orders" ADD CONSTRAINT "getcourse_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
