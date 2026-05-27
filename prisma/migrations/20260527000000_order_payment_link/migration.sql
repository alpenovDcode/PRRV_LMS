-- Поля для админских платёжных ссылок: paymentLinkToken (для авторизации
-- публичной страницы /pay/[orderId]) и createdByAdminId (для аудита).
ALTER TABLE "orders"
    ADD COLUMN "payment_link_token"  TEXT,
    ADD COLUMN "created_by_admin_id" TEXT;

CREATE UNIQUE INDEX "orders_payment_link_token_key"
    ON "orders"("payment_link_token");
