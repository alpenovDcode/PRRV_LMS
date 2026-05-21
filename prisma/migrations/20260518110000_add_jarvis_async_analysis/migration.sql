-- Async AI-analysis state on homework_submissions.
-- aiAnalysisStartedAt: момент, когда куратор нажал "Проверка от Джарвикса"
--   и LMS успешно передал работу AI-checker. Если выставлено, а
--   aiAnalyzedAt и aiAnalysisError ещё null — анализ в процессе,
--   фронт делает polling.
-- aiAnalysisError: текст ошибки, если AI-checker не смог обработать
--   задание (или связь оборвалась). Фронт показывает её куратору и
--   позволяет перезапустить.

ALTER TABLE "homework_submissions"
  ADD COLUMN IF NOT EXISTS "ai_analysis_started_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "ai_analysis_error"      TEXT;
