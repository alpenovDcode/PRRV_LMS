-- Отдельные колонки для ответов формы оффера и UTM — чтобы webhook
-- провайдера (перезаписывающий yk_snapshot) их не затирал.
ALTER TABLE "orders" ADD COLUMN "form_answers" JSONB;
ALTER TABLE "orders" ADD COLUMN "utm" JSONB;
