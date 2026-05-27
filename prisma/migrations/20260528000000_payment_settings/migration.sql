-- Singleton-таблица настроек платёжного модуля (чек 54-ФЗ + restricted methods).
-- Хранит одну строку с id='default'.
CREATE TABLE "payment_settings" (
    "id"                 TEXT         NOT NULL DEFAULT 'default',
    "receipt_enabled"    BOOLEAN      NOT NULL DEFAULT true,
    "taxation_system"    INTEGER      NOT NULL DEFAULT 1,
    "vat"                INTEGER      NOT NULL DEFAULT 0,
    "method"             INTEGER      NOT NULL DEFAULT 4,
    "object"             INTEGER      NOT NULL DEFAULT 4,
    "restricted_methods" TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
    "payment_schema"     TEXT         NOT NULL DEFAULT 'Single',
    "updated_at"         TIMESTAMP(3) NOT NULL,
    "updated_by_id"      TEXT,
    CONSTRAINT "payment_settings_pkey" PRIMARY KEY ("id")
);

-- Сразу создаём дефолтную запись (для UI не нужно было её создавать вручную)
INSERT INTO "payment_settings" ("id", "updated_at")
VALUES ('default', NOW());
