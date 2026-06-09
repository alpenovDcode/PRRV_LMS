-- Публичный slug на оффере. URL /offer/<slug> отдаёт страницу оплаты
-- любому посетителю — каждый получает свой Order при сабмите формы.
ALTER TABLE "offers" ADD COLUMN "public_slug" TEXT;

-- Slug уникальный — иначе два оффера на одной странице.
CREATE UNIQUE INDEX "offers_public_slug_key" ON "offers"("public_slug");
