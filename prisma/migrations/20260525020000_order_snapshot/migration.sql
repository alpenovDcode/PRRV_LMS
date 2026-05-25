-- Snapshot оффера на момент создания заказа (защита от изменения оффера задним числом)
ALTER TABLE "orders"
    ADD COLUMN "snapshot_course_ids"   TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "snapshot_tariff"       "UserTariff",
    ADD COLUMN "snapshot_access_days"  INTEGER,
    ADD COLUMN "snapshot_offer_title"  TEXT;
