-- Конфиг полей формы публичной страницы оффера /offer/<slug>.
-- JSON: phone-настройки + массив custom-полей.
ALTER TABLE "offers" ADD COLUMN "form_config" JSONB;
