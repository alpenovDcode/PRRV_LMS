-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending', 'waiting_for_capture', 'paid', 'cancelled', 'refunded');

-- CreateTable: offers
CREATE TABLE "offers" (
    "id"          TEXT          NOT NULL,
    "title"       TEXT          NOT NULL,
    "description" TEXT,
    "price"       DECIMAL(10,2) NOT NULL,
    "old_price"   DECIMAL(10,2),
    "currency"    TEXT          NOT NULL DEFAULT 'RUB',
    "is_active"   BOOLEAN       NOT NULL DEFAULT true,
    "access_days" INTEGER,
    "course_ids"  TEXT[]        NOT NULL DEFAULT ARRAY[]::TEXT[],
    "tariff"      "UserTariff",
    "features"    TEXT[]        NOT NULL DEFAULT ARRAY[]::TEXT[],
    "sort_order"  INTEGER       NOT NULL DEFAULT 0,
    "created_at"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3)  NOT NULL,
    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable: orders
CREATE TABLE "orders" (
    "id"                  TEXT          NOT NULL,
    "user_id"             TEXT          NOT NULL,
    "offer_id"            TEXT          NOT NULL,
    "amount"              DECIMAL(10,2) NOT NULL,
    "currency"            TEXT          NOT NULL DEFAULT 'RUB',
    "status"              "OrderStatus" NOT NULL DEFAULT 'pending',
    "yk_payment_id"       TEXT,
    "yk_confirmation_url" TEXT,
    "payment_method"      TEXT,
    "yk_snapshot"         JSONB,
    "paid_at"             TIMESTAMP(3),
    "created_at"          TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMP(3)  NOT NULL,
    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "orders_yk_payment_id_key"  ON "orders"("yk_payment_id");
CREATE INDEX        "orders_user_id_idx"         ON "orders"("user_id");
CREATE INDEX        "orders_yk_payment_id_idx"   ON "orders"("yk_payment_id");

-- Foreign keys
ALTER TABLE "orders"
    ADD CONSTRAINT "orders_user_id_fkey"
        FOREIGN KEY ("user_id")  REFERENCES "users"("id")  ON DELETE CASCADE  ON UPDATE CASCADE;

ALTER TABLE "orders"
    ADD CONSTRAINT "orders_offer_id_fkey"
        FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
