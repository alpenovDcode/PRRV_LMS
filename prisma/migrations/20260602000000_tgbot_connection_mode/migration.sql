-- FWD-1: connection_mode для TgBot (webhook | forwarded)
-- Используется чтобы LMS могла «наблюдать» бота, у которого webhook стоит
-- на стороннем backend (prepodavai polling): не вызывать setWebhook и не
-- отправлять исходящих, только принимать форварды и копить подписчиков.

ALTER TABLE "tg_bots"
  ADD COLUMN "connection_mode" TEXT NOT NULL DEFAULT 'webhook';
