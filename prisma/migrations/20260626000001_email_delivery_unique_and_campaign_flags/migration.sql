-- Защита маркетинговых рассылок от дублей и race conditions.
--
-- 1) UNIQUE(campaign_id, user_id) на email_delivery_jobs.
--    Без этого constraint'a `skipDuplicates:true` в Prisma createMany —
--    NO-OP. При параллельном enqueue или двойном cron-tick создавались
--    дубликаты jobs → пользователь получал по 2+ копии письма.
--    Postgres unique допускает множественные NULL, поэтому удалённые
--    пользователи (user_id=null) не блокируются.
--
-- 2) tokens_ready на email_campaigns. Раньше /send синхронно генерил
--    unsubscribeToken для 70K пользователей в HTTP-обработчике — nginx
--    тайм-аут. Теперь /send только ставит флаг, cron-tick фоном
--    дотягивает.
--
-- 3) enqueue_complete на email_campaigns. processFinishedCampaigns
--    раньше мог финишировать кампанию преждевременно — если enqueue
--    ещё не доехал до создания всех jobs, pending=0 не значит "всё
--    ушло". Этот флаг защищает от такого финиша.
--
-- ALTER TABLE на email_campaigns с DEFAULT — мгновенный через метаданные
-- (PG 11+). ALTER TABLE с ADD CONSTRAINT UNIQUE на email_delivery_jobs —
-- блокирующий full scan; на пустой таблице моментально, на проде с
-- историей лучше делать в окне (но пока история пустая — безопасно).

ALTER TABLE "email_delivery_jobs"
  ADD CONSTRAINT "email_delivery_jobs_campaign_user_unique"
  UNIQUE ("campaign_id", "user_id");

ALTER TABLE "email_campaigns"
  ADD COLUMN "tokens_ready" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "enqueue_complete" BOOLEAN NOT NULL DEFAULT false;
