# Bot Platform — Operations Guide

Внутренняя SaleBot-альтернатива в Proryv LMS. Этот документ — карта
эксплуатации: что где живёт, как восстанавливать, какие переменные
обязательны.

## Стек

- **Next.js 16** (`app/` роуты, App Router)
- **Prisma 5.22 + PostgreSQL** — модели `Tg*` (см. `prisma/schema.prisma`)
- **Redis** — rate limit, дедупликация update_id, token-bucket
- **No grammY**: общение с Telegram через `fetch` (`lib/tg/api.ts`)
- **AES-256-GCM** — шифрование токенов ботов (`lib/tg/crypto.ts`)
- **Pratt-парсер** — собственный expression engine (`lib/tg/expr/*`)

## Обязательные env

| Переменная             | Что делает                                                |
|------------------------|-----------------------------------------------------------|
| `DATABASE_URL`         | Postgres connection string                                |
| `REDIS_URL`            | Redis для rate-limit и idempotency                        |
| `TG_TOKEN_ENC_KEY`     | 32+ символа. **Бэкап обязателен** — без него токены ботов мёртвые |
| `PUBLIC_APP_URL`       | https://lms.example.com — используется в `/r/<slug>` редиректах |
| `API_SECRET_KEY`       | (опц.) серверный bypass для server-to-server вызовов      |

## Ключевые таблицы

- `tg_bots` — токены (AES-GCM), webhook secret, adminChatIds, projectVariables
- `tg_subscribers` — подписчики, variables (JSON), customFields (JSON), currentPosition*
- `tg_flows` — графы воронок (JSON), triggers (JSON)
- `tg_flow_runs` — runtime state: queued/sleeping/waiting_reply/...
- `tg_messages` — лог всех сообщений (in/out)
- `tg_media_files` — file_id-кэш для переиспользования
- `tg_lists` + `tg_subscriber_lists` — сегменты
- `tg_custom_fields` — schema для типизированных доп.полей
- `tg_redirect_links` — `/r/<slug>` для click-tracking
- `tg_audit_log` — кто-что-когда менял (мутации)

## Crons

`/api/tg-cron/tick` — раз в минуту:
- `processDueRuns()` — продвигает `sleeping` и `waiting_reply`, у которых `resumeAt` истёк
- Дёргает `broadcasts.tick()` если есть scheduled рассылки

`/api/tg-cron/purge-audit` (опц.) — раз в сутки:
- `purgeOldAuditLogs(180)` — чистит лог старше 180 дней

## Восстановление при инцидентах

### "Бот не отвечает"
1. Проверь `/admin/bots/<id>` → карточка «Состояние вебхука» → должна гореть зелёным
2. Если красным с `pending_update_count > 100` — нажми «Переустановить вебхук»
3. Если ошибка `Unauthorized` (401) от Telegram — токен ротировали, нужно пересоздать бота
4. Проверь логи cron `tg-cron/tick` — если давно молчит, флоу-раны просто не двигаются

### "Не могу расшифровать токены ботов"
Симптом: после деплоя боты падают с «invalid auth tag». **Корень**: ротировали `TG_TOKEN_ENC_KEY` без миграции.
**Решение**:
- Откатить env обратно, **никогда не ротировать ключ без миграции токенов**
- Если ключ потерян безвозвратно — токены ботов нужно ввести заново через интерфейс создания бота

### "Рассылка зависла в statuse `sending`"
1. Проверь cron — он мог упасть посередине
2. Сходи в БД: `UPDATE tg_broadcasts SET status='draft' WHERE id='...';`
   и пересоздай через UI, либо вручную перезапусти `processBroadcast()`

## Бэкап и DR

**Обязательный backup:**
- `pg_dump` всей БД ежедневно. Хранить ≥ 30 дней.
- `TG_TOKEN_ENC_KEY` — в secret-менеджере (1Password / Vault / GCP Secret Manager). **Не в git.**

**Что НЕ надо бэкапить:**
- Redis — только кэш и rate-limit state, восстанавливается сам
- `.next/` — пересобирается при деплое

**Что нельзя восстановить без бэкапа БД:**
- История диалогов (`tg_messages`)
- Текущая позиция подписчиков в воронках (`tg_subscribers.current_position_*`)
- Запланированные дожимы (`tg_flow_runs` с status=sleeping)
- `tg_audit_log` — потерянная история действий

## Аудит-лог

Каждая мутирующая операция админ-API пишет в `tg_audit_log` через `lib/tg/admin-api.ts → withAdminApi({ auditAction })`. Просмотр (пока — через SQL):

```sql
SELECT action, actor_email, bot_id, details, created_at
FROM tg_audit_log
WHERE created_at >= now() - interval '24 hour'
ORDER BY created_at DESC
LIMIT 100;
```

## Rate Limits

**Outbound (к Telegram):**
- Глобально: 28 req/s на бота (Telegram кап = 30)
- На одного юзера: 1 req/s (избегаем `429 Too Many Requests`)

**Inbound (от админов):**
- `default` (GET): 10 RPS, burst 30
- `write` (POST/PATCH/DELETE): 4 RPS, burst 12
- `broadcast` (создание рассылки): 0.2 RPS, burst 2

Реализация в `lib/tg/admin-rate-limit.ts`, Redis token-bucket. Fails OPEN — если Redis лёг, всё пропускаем.

## Безопасность

1. **Токены ботов** — AES-256-GCM, key из env. После прочтения из БД сразу `decryptToken()`, никогда не логировать.
2. **Webhook** — Telegram присылает `X-Telegram-Bot-Api-Secret-Token`; webhook handler проверяет через `timingSafeEqual`. Если в логе видно `secret mismatch` — кто-то стучится не с тем токеном (попытка подделки).
3. **Идемпотентность** — все Telegram updates помечаются в Redis SETNX на `update_id`. Telegram любит ретраить — это нормально.
4. **Sanitization** — HTML в сообщениях санируется в `lib/tg/sanitize.ts`: whitelist `<b><i><u><s><a><code><pre><span>`. Всё остальное (включая `<script>`) удаляется.
5. **Файлы из не-админ-чатов НЕ идут в библиотеку** — `lib/tg/media-library.ts` проверяет `bot.adminChatIds` whitelist.
6. **152-ФЗ**: вся PII (телефоны, email, имена) хранится в РФ-БД клиента. Удаление подписчика → `db.tgSubscriber.delete()` каскадно сносит все его сообщения, runs, list-membership.

## Деплой

1. `git pull`
2. Применить миграции: `npx prisma migrate deploy`
3. Перегенерировать клиент: `npx prisma generate`
4. Пересобрать: `npm run build`
5. Перезапустить: `docker compose up -d` (или зеркальная blue/green схема)

Если есть `tg_flow_runs` в `sleeping` за момент деплоя — они не пострадают, `processDueRuns()` подхватит их в следующий тик cron.

## Куда смотреть метрики

- `/admin/bots/<id>` — обзор бота, последние события, состояние вебхука
- `/admin/bots/<id>/analytics` — графики, когорты, attribution
- `/admin/bots/<id>/broadcasts` — статус рассылок
- `tg_events` — таблица аналитических событий (источник всех графиков)
