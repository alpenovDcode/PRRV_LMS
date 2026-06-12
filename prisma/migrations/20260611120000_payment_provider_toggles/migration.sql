-- Чекбоксы «Включён» для каждого провайдера оплаты в админке.
-- По умолчанию все три true — поведение не меняется для существующих
-- сред (провайдеры доступны как раньше, если их env заполнены).
ALTER TABLE "payment_settings"
  ADD COLUMN "cloudpayments_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "otp_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "freshcredit_enabled" BOOLEAN NOT NULL DEFAULT true;
