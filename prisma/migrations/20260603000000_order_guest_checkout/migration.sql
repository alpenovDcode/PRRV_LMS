-- GUEST-1: гостевая оплата по ссылке.
-- Order.userId становится опциональным: менеджер может создать заказ-
-- «пустышку» без привязки к LMS-юзеру. На странице оплаты клиент
-- заполняет ФИО/email/телефон, и в этот момент userId привязывается
-- (найденный по email или новый пользователь, созданный из guest-данных).

-- Дропаем FK constraint и пересоздаём с onDelete SetNull.
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_user_id_fkey";

ALTER TABLE "orders"
  ALTER COLUMN "user_id" DROP NOT NULL;

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Guest-поля для аудита: что клиент ввёл на форме, даже если потом
-- его подцепило к существующему юзеру.
ALTER TABLE "orders"
  ADD COLUMN "guest_full_name" TEXT,
  ADD COLUMN "guest_email" TEXT,
  ADD COLUMN "guest_phone" TEXT,
  -- Если пользователь был создан гостем (а не существовал до этого),
  -- активация заказа отправит welcome-email с временным паролем.
  ADD COLUMN "user_created_from_guest" BOOLEAN NOT NULL DEFAULT FALSE;
