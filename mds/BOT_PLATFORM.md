# Bot platform (Telegram) — установка и эксплуатация

Маркетинговая платформа уровня SaleBot/BotHelp поверх Proryv LMS.
Подписчики, сценарии (flows), рассылки, UTM-ссылки. Все таблицы под
префиксом `tg_*` — существующая ЛМС не затронута.

## 1. Что появилось

| Слой | Где |
|---|---|
| Схема БД | `prisma/schema.prisma` (модели `Tg*`) + миграция `prisma/migrations/20260512000000_add_bot_platform/` |
| Ядро | `lib/tg/*` — API-клиент, шифрование токенов, rate-limit, sender, events, flow-engine, broadcast worker |
| Inbound | `app/api/tg-webhook/[botId]/route.ts` (публичный, защищён `X-Telegram-Bot-Api-Secret-Token`) |
| Cron | `app/api/tg-cron/tick/route.ts` (защищён `TG_CRON_SECRET`, гоняет flow-engine и broadcast-worker) |
| Админ-API | `app/api/admin/tg/bots/...` (через `withAuth({roles:["admin"]})`) |
| Админ-UI | `/admin/bots` и `/admin/bots/[botId]/...` |

## 2. Что нужно сделать перед первым запуском

### 2.1 Env-переменные

Добавить в `.env`:

```env
TG_TOKEN_ENC_KEY="$(openssl rand -hex 32)"
TG_CRON_SECRET="$(openssl rand -hex 32)"
# Должен указывать на публично доступный URL фронта
NEXT_PUBLIC_APP_URL="https://your-domain.tld"
```

> **Безопасность:** `TG_TOKEN_ENC_KEY` шифрует токены ботов AES-256-GCM.
> Утеря ключа = потеря всех подключённых ботов (потребуется переподключение).
> Ротация ключа = переподключение всех ботов вручную.

### 2.2 Миграция БД

```bash
npx prisma migrate deploy
```

Миграция аддитивная — добавляет 9 новых таблиц с префиксом `tg_*`,
существующие данные не трогает. Безопасно на проде.

### 2.3 Cron для движка

Cron-эндпоинт нужен, чтобы:
- продвигались задержки в сценариях (`delay`, `wait_reply`-timeout);
- отправлялись запланированные/частично отправленные рассылки.

Вариант **A** — отдельный systemd/docker процесс:

```bash
*/1 * * * * curl -s -X POST \
  -H "Authorization: Bearer $TG_CRON_SECRET" \
  https://your-domain.tld/api/tg-cron/tick > /dev/null
```

Вариант **B** — Vercel Cron (если деплой на Vercel):

```json
// vercel.json
{
  "crons": [{ "path": "/api/tg-cron/tick", "schedule": "*/1 * * * *" }]
}
```

(Vercel Cron не передаёт `Authorization`, поэтому понадобится отдельный
эндпоинт без проверки — или используйте внешний планировщик.)

Рекомендованная частота: **15–60 секунд**. Чем чаще — тем меньше дрожь
у задержек, но больше нагрузка. По умолчанию воркер обрабатывает
до 100 рассылок-получателей и 100 due-сценариев за один тик.

## 3. Подключить первого бота

1. Создать бота через `@BotFather`, получить токен.
2. Зайти в `/admin/bots` → «Подключить бота».
3. Вставить токен. Платформа:
   - вызовет `getMe` для проверки;
   - сгенерирует случайный `webhookSecret`;
   - зашифрует токен AES-256-GCM;
   - зарегистрирует webhook `${NEXT_PUBLIC_APP_URL}/api/tg-webhook/<botId>`
     с секретом в header `X-Telegram-Bot-Api-Secret-Token`.

После подключения подписчики, написавшие боту, появятся во вкладке
«Подписчики».

## 4. Сценарии (flows)

Граф хранится как JSON в `tg_flows.graph`. Контракт — `lib/tg/flow-schema.ts`,
валидируется через Zod в API.

Типы нод:

| Тип | Назначение |
|---|---|
| `message` | Отправить текст/фото + кнопки (inline-keyboard). Поддерживает шаблоны `{{user.first_name}}`, `{{vars.X}}`, `{{ctx.X}}`. |
| `delay` | Пауза N секунд (до 30 дней). Run переходит в `sleeping`, поднимется по cron. |
| `wait_reply` | Ждать ответ пользователя, сохранить в переменную. По таймауту — `timeoutNext`. |
| `condition` | If/else по тегам или переменным. Первое совпадение выигрывает; `defaultNext` — fallback. |
| `add_tag`, `remove_tag` | Управление тегами подписчика. |
| `set_variable` | Записать `{key: value}` (значение тоже шаблон) в `tg_subscribers.variables`. |
| `http_request` | Внешний вебхук. Может сохранить JSON-ответ в `ctx.<saveAs>`. По ошибке — `onError`. |
| `goto_flow` | Завершить текущий run, запустить указанный flow. |
| `end` | Конец. |

Триггеры:

```json
[
  {"type": "command", "command": "start", "payloads": ["promo15"]},
  {"type": "keyword", "keywords": ["купить", "хочу"]},
  {"type": "regex", "pattern": "^[0-9]{6}$"},
  {"type": "subscribed"}
]
```

UI-шаблоны (приветствие, лид-магнит, мини-квиз) — в `lib/tg/flow-templates.ts`.

## 5. Рассылки

`/admin/bots/<botId>/broadcasts/new` → текст, фото, кнопки-URL,
фильтр по тегам, «запустить сразу» или сохранить черновиком.

Жизненный цикл: `draft → scheduled → sending → completed`.
При переводе в `sending` материализуются строки `tg_broadcast_recipients`
для всех подходящих подписчиков (стримом по 1000), а воркер начинает
их обрабатывать с rate-limit 28 msg/s глобально и 1 msg/s на чат.

Если Telegram возвращает 403 / "bot was blocked" — подписчик помечается
`isBlocked = true`, в рассылке статус `blocked` (не считается провалом).
429 / 5xx / сеть — exponential backoff (30s → 2m → 10m), до 3 попыток.

## 6. UTM-ссылки

`/admin/bots/<botId>/links` → создать slug, прикрепить теги и UTM.
Готовая ссылка: `https://t.me/<bot-username>?start=<slug>`.

При первом нажатии:
- подписчик создаётся, если ещё не был;
- ставятся `applyTags`;
- заполняются `firstTouchSlug`/`firstTouchAt`/`lastTouchSlug`/`lastTouchAt`;
- если у ссылки задан `startFlowId` — запускается этот сценарий;
- пишется `tg_events.type = 'link.clicked'` с UTM в `properties`.

Дальше можно фильтровать аналитику по `tg_subscribers.firstTouchSlug`
и `tg_events.properties->>'slug'`.

## 7. Безопасность

- **Токены ботов** — AES-256-GCM, ключ из `TG_TOKEN_ENC_KEY`.
- **Inbound webhook** — путь `/api/tg-webhook/<botId>` публичный, но
  проверяется `X-Telegram-Bot-Api-Secret-Token` через `timingSafeEqual`.
  В URL только botId — это маршрутизатор, не секрет.
- **Cron** — `Authorization: Bearer <TG_CRON_SECRET>`, тоже через
  `timingSafeEqual`.
- **Админ-API** — `withAuth({roles:["admin"]})`, сессия из cookies + JWT.
- **Idempotency** — `update_id` каждого апдейта дедуплицируется через
  Redis SETNX TTL 1 час.
- **HTML-санитизация** — `lib/tg/sanitize.ts` пропускает только TG-белый
  список тегов; href разрешён только `http(s)://` и `tg://`.
- **Rate-limit** — token-bucket в Redis, общий бюджет TG (30/s) и
  per-chat (1/s), даже если работают несколько Node-инстансов.

## 8. Что НЕ сделано (осознанно, вне MVP)

- Визуальный граф-редактор сценариев (пока — JSON-редактор + шаблоны).
- Multi-tenant: платформа single-tenant, как и остальная LMS.
- A/B-тесты внутри сценариев / рассылок.
- WhatsApp / VK / прочие каналы.
- Внешние webhooks наружу (events → клиентский URL).
- Биллинг (SaaS-режим).
- Публичный REST API с API-ключами.
- ClickHouse / OLAP — события пишутся в Postgres.

Эти куски легко довешиваются поверх готового ядра — все события
проходят через `lib/tg/events.ts`, статус-машина сценариев и
broadcast-воркера переживают рестарт.
