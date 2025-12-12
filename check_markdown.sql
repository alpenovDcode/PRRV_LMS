-- SQL запрос для проверки markdown в базе данных
-- Выполните на проде в psql

SELECT 
  id,
  title,
  type,
  LENGTH(content::text) as content_length,
  SUBSTRING(content->>'markdown', 1, 200) as markdown_preview
FROM lessons
WHERE type = 'text'
  AND content->>'markdown' LIKE '%cloudflare%'
LIMIT 5;

-- Или более детально для конкретного урока:
SELECT 
  id,
  title,
  content->>'markdown' as full_markdown
FROM lessons
WHERE title LIKE '%Навигация%'
  AND type = 'text';
