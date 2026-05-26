-- Поля возврата для Order: refundedAt, refundReason, refundedAmount.
-- refundedAmount null/= amount = полный возврат, меньше = частичный.
ALTER TABLE "orders"
    ADD COLUMN "refunded_at"     TIMESTAMP(3),
    ADD COLUMN "refund_reason"   TEXT,
    ADD COLUMN "refunded_amount" DECIMAL(10,2);
