-- Диагностика homework_submissions, у которых content был обрезан
-- 10000-символьным лимитом sanitizeUserInput. Запускать ДО фикса
-- (./app/api/lessons/[id]/homework/route.ts) чтобы понять масштаб,
-- и ПОСЛЕ — чтобы убедиться что новые сабмишены приходят целыми.

-- 1. Сколько submissions с длиной content в подозрительной зоне
SELECT
  CASE
    WHEN length(content) BETWEEN 9990 AND 10000 THEN 'почти-наверняка обрезано (9990–10000)'
    WHEN length(content) BETWEEN 9500 AND 9989 THEN 'возможно обрезано (9500–9989)'
    WHEN length(content) > 10000 THEN 'не обрезано (>10000, после фикса)'
    ELSE 'короткий, не релевантно'
  END AS bucket,
  count(*) AS n
FROM homework_submissions
WHERE content IS NOT NULL
GROUP BY 1
ORDER BY n DESC;

-- 2. Конкретные submissions с обрезкой
SELECT
  hs.id,
  hs.created_at,
  u.email,
  l.title AS lesson_title,
  l.type AS lesson_type,
  length(hs.content) AS content_len,
  hs.status,
  substring(hs.content, 9970, 100) AS tail
FROM homework_submissions hs
JOIN users u ON u.id = hs.user_id
JOIN lessons l ON l.id = hs.lesson_id
WHERE length(hs.content) BETWEEN 9990 AND 10000
ORDER BY hs.created_at DESC
LIMIT 50;

-- 3. Распределение по урокам — найти которые баг затронул сильнее всего
SELECT
  l.id AS lesson_id,
  l.title,
  l.type,
  count(*) FILTER (WHERE length(hs.content) BETWEEN 9990 AND 10000) AS truncated,
  count(*) AS total
FROM lessons l
JOIN homework_submissions hs ON hs.lesson_id = l.id
WHERE l.type IN ('certification_form', 'intermediate_survey')
GROUP BY l.id, l.title, l.type
HAVING count(*) FILTER (WHERE length(hs.content) BETWEEN 9990 AND 10000) > 0
ORDER BY truncated DESC;
