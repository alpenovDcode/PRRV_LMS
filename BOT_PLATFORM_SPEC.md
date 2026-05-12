# Маркетинговая бот-платформа на базе Proryv LMS
**Спецификация для обсуждения с командой**

> Версия документа: 0.1 (драфт для обсуждения)
> Дата: 2026-05-11
> Статус: к обсуждению, не утверждён

---

## TL;DR

Строим SaaS-аналог BotHelp / SaleBot поверх существующей Proryv LMS, с фокусом на **маркетинговую аналитику, удобный публичный REST API и кастомные UTM-поля** — то, где конкуренты слабы.

- **Канал на старте:** только Telegram.
- **Модель:** SaaS для других школ + использование для своей базы.
- **Срок MVP** (маркетинговое ядро + рассылки + базовый конструктор): **6–8 недель** на 1 фуллстек-разработчика.
- **Срок полного SaaS** (с биллингом, A/B, продвинутой аналитикой): **4–5 месяцев**.
- **Главный риск:** проект сейчас single-tenant — нужна миграция на multi-tenant **первым этапом**, иначе через 2–3 месяца цена возрастает кратно.
- **Killer features против конкурентов:**
  1. Полноценный REST API + OpenAPI + SDK (у BotHelp нет, у SaleBot слабый).
  2. Event-driven аналитика с произвольными UTM-полями (у обоих фиксированные поля).
  3. AI-узлы в сценариях на собственной RAG-базе (OpenClaw уже в стеке).
  4. Бесшовная интеграция с LMS (события «купил курс / сдал ДЗ / получил сертификат» как триггеры воронок).

---

## 1. Контекст и цели

### 1.1 Бизнес-цель
Дать школам инструмент, который заменяет BotHelp/SaleBot и при этом:
- Глубоко интегрирован с обучением (LMS-события как триггеры).
- Имеет нормальный REST API для внешних интеграций (CRM, BI, лендинги).
- Позволяет считать маркетинговую эффективность по любым кастомным разрезам, а не только по фиксированному набору UTM.

### 1.2 Что НЕ делаем (вне скоупа MVP)
- WhatsApp, VK, Instagram, Viber — только TG на старте.
- Сложные конструкторы лендингов (у нас уже есть `LandingPage` — расширим, но не переделываем).
- Звонилки / SMS-рассылки.
- Десктоп-приложение / мобильное приложение оператора (только web).

### 1.3 Позиционирование vs конкуренты

| Возможность | BotHelp | SaleBot | **Мы** |
|---|---|---|---|
| Визуальный конструктор | ✅ | ✅ | ✅ |
| Telegram | ✅ | ✅ | ✅ |
| Мультиканал (WA/VK/IG) | ✅ | ✅ | ❌ (план) |
| Публичный REST API | ⚠️ слабый | ⚠️ ограниченный | ✅ полноценный |
| Кастомные UTM-поля | ❌ фикс. набор | ❌ фикс. набор | ✅ произвольный JSON |
| AI-узлы (на своей базе) | ⚠️ ChatGPT | ⚠️ ChatGPT | ✅ собственный RAG |
| Интеграция с LMS | ❌ | ❌ | ✅ нативно |
| Когортная аналитика | ⚠️ базово | ❌ | ✅ |
| Атрибуция first/last touch | ❌ | ❌ | ✅ |
| Webhooks наружу | ✅ | ✅ | ✅ |
| Цена | от 990 ₽/мес | от 599 ₽/мес | TBD |

---

## 2. Целевая аудитория и юзкейсы

### 2.1 ICP (идеальный клиент)
- Онлайн-школы 50–10 000 учеников.
- Эксперты-продюсеры, проводящие запуски через TG.
- Маркетинговые агентства, ведущие 2–10 школ одновременно (важно: один аккаунт = много ботов).

### 2.2 Ключевые юзкейсы
1. **Запуск с прогревом** — лид-магнит → серия касаний → продажа курса → апсейл.
2. **Вебинарная воронка** — регистрация → напоминания → трансляция → дожим неоплативших.
3. **Реактивация базы** — сегмент «не активен 30 дней» → реактивационная цепочка.
4. **Поддержка учеников** — FAQ-бот с AI-ответами по базе знаний школы.
5. **Партнёрская программа** — уникальный UTM на партнёра, дашборд выплат.
6. **Интеграция с CRM** — все новые подписчики автоматически уходят в Bitrix/AmoCRM через webhook.

---

## 3. Текущее состояние проекта (что есть)

### 3.1 Стек
- **Next.js 16**, React 18, TypeScript 5.3
- **Prisma 5.7** + PostgreSQL 16
- **Redis 7** (сейчас используется только под rate-limit)
- **Auth:** custom JWT + 2FA (TOTP)
- **AI:** OpenClaw RAG (локально), Ollama (`bge-m3` embeddings), Replicate
- **Email:** Nodemailer + кастомная система шаблонов
- **Storage:** AWS S3, Cloudflare Stream/R2
- **Monitoring:** Sentry (опционально)

### 3.2 Что переиспользуем
| Что | Где | Как используем |
|---|---|---|
| JWT-auth + 2FA | `lib/auth/*` | Расширяем org-скоупом |
| Broadcast | `prisma/schema.prisma` (модель `Broadcast`) | Добавляем канал `telegram` |
| Group / GroupMember | там же | Основа для сегментов |
| Bitrix-вебхуки | `app/api/bitrix/*` | Паттерн для webhooks наружу |
| OpenClaw RAG | `app/api/ai/chat` | AI-нода в воронках |
| EmailTemplate | модель + рендерер | Шаблоны TG-сообщений по аналогии |
| LandingPage | модель `LandingPage` | Лид-формы → точка входа в воронку |
| Question/QuestionMessage | модели | Чат-оператор (живое подключение) |
| Redis | `lib/redis.ts` | + BullMQ |
| Rate-limit | `lib/rate-limit.ts` | + лимиты публичного API |

### 3.3 Чего нет (критические гэпы)
1. **Multi-tenancy** — все модели single-tenant, нет `Organization`/`organizationId`.
2. **Очередь задач** — нет BullMQ/cron/scheduler.
3. **Inbound Telegram** — папка `app/api/telegram/` пустая, есть только outbound в `lib/telegram.ts`.
4. **Платежи** — ни YooKassa, ни Stripe, ни Telegram Payments.
5. **Event stream** — нет таблицы событий, нет аналитического слоя.
6. **Публичный API** — есть только внутренний.

---

## 4. Маркетинговый функционал — детально

### 4.1 Атрибуция и UTM

**Проблема:** Telegram deeplink-payload ограничен 64 байтами (`t.me/bot?start=XXX`). Нельзя засунуть туда полные UTM.

**Решение:** Таблица `TrackingLink` хранит набор UTM + произвольных полей, в payload летит только короткий ID.

#### Схема
```prisma
model TrackingLink {
  id            String   @id @default(cuid())
  orgId         String
  botId         String
  slug          String   // короткий ID для payload (8 символов)
  name          String   // человекочитаемое имя
  destination   Json     // { type: "start", flowId: "...", customStart: "promo123" }

  // Стандартные UTM
  utmSource     String?
  utmMedium     String?
  utmCampaign   String?
  utmContent    String?
  utmTerm       String?

  // Произвольные кастомные поля — школа сама определяет схему
  customFields  Json     // { partner_id: "p42", manager: "ivan", webinar_date: "2026-05-15" }

  // Веб-редирект (если ссылка используется не только для TG)
  redirectUrl   String?  // если задано — клик идёт через наш сокращатель

  clickCount    Int      @default(0)
  subscribeCount Int     @default(0)
  createdAt     DateTime @default(now())
  expiresAt     DateTime?

  org           Organization @relation(...)
  bot           TgBot @relation(...)
  clicks        LinkClick[]

  @@unique([orgId, slug])
  @@index([botId, slug])
}

model LinkClick {
  id            String   @id @default(cuid())
  linkId        String
  ip            String?
  userAgent     String?
  referrer      String?
  country       String?  // через GeoIP
  subscriberId  String?  // если удалось связать с подписчиком
  clickedAt     DateTime @default(now())

  link          TrackingLink @relation(...)

  @@index([linkId, clickedAt])
}
```

#### Атрибуция в `Subscriber`
```prisma
model TgSubscriber {
  // ... базовые поля
  firstTouchLinkId  String?  // ссылка, по которой пришёл изначально
  firstTouchAt      DateTime?
  lastTouchLinkId   String?  // последняя ссылка перед текущей сессией
  lastTouchAt       DateTime?

  // Снимок UTM на момент подписки
  firstTouchUtm     Json?
  lastTouchUtm      Json?
}
```

#### Модели атрибуции
В UI школа выбирает модель атрибуции для отчёта:
- **First-touch** — выручка засчитывается источнику первого касания.
- **Last-touch** — последнему касанию перед конверсией.
- **Linear** — равные доли всем касаниям в цепочке (требует хранения всех касаний — отдельная таблица `SubscriberTouch`, нужно решить, делаем ли в MVP).

**Рекомендация для MVP:** только first/last-touch, linear — в Этап 4+.

### 4.2 Event stream

**Центральная таблица всей аналитики:**

```prisma
model Event {
  id            String   @id @default(cuid())
  orgId         String
  subscriberId  String?
  botId         String?
  flowId        String?
  flowRunId     String?

  type          String   // см. словарь ниже
  properties    Json     // зависит от type
  utmSnapshot   Json?    // КОПИЯ UTM на момент события — критично для корректной атрибуции

  occurredAt    DateTime @default(now())

  @@index([orgId, type, occurredAt])
  @@index([subscriberId, occurredAt])
  @@index([orgId, occurredAt])  // для дашбордов по периодам
}
```

#### Словарь типов событий (фиксированный, расширяемый через `properties`)

| type | properties (примеры) | Когда |
|---|---|---|
| `subscriber.created` | `{ source, linkId }` | Новая подписка |
| `subscriber.blocked_bot` | — | Юзер заблокировал бота |
| `subscriber.unblocked_bot` | — | Разблокировал |
| `subscriber.tag_added` | `{ tag }` | Добавлен тег |
| `subscriber.tag_removed` | `{ tag }` | Убран тег |
| `subscriber.variable_set` | `{ key, value }` | Установлена переменная |
| `message.sent` | `{ messageId, nodeId, broadcastId? }` | Отправлено сообщение |
| `message.delivered` | `{ messageId }` | TG подтвердил доставку |
| `message.read` | `{ messageId }` | Прочитано (если доступно) |
| `message.received` | `{ messageId, text }` | Получено от юзера |
| `button.clicked` | `{ nodeId, buttonId, label }` | Нажата inline-кнопка |
| `flow.entered` | `{ flowId, triggerType }` | Запуск воронки |
| `flow.node_executed` | `{ flowId, nodeId, nodeType }` | Прошёл ноду |
| `flow.completed` | `{ flowId, duration }` | Успешно завершил |
| `flow.dropped` | `{ flowId, atNodeId, reason }` | Отвалился (таймаут wait_for_reply / блок) |
| `link.clicked` | `{ linkId }` | Клик по ссылке (веб-сокращатель) |
| `payment.initiated` | `{ amount, currency, productId }` | Инициирована оплата |
| `payment.succeeded` | `{ amount, currency, productId, paymentId }` | Оплачено |
| `payment.failed` | `{ reason }` | Не прошло |
| `custom` | `{ name, ... }` | Кастомное событие через API |

#### Объём и производительность
- **Оценка:** 100k активных подписчиков × средняя активность ≈ **5–20M событий/месяц**.
- **На старте:** PostgreSQL + индексы по `(orgId, type, occurredAt)`.
- **Партиционирование** по `occurredAt` (месячные партиции) включаем при >10M строк.
- **Архивирование:** события старше 90 дней — в холодный storage (`Event_archive` или S3 parquet) с возможностью точечного запроса.
- **Перенос в ClickHouse** — когда упрёмся в Postgres (ориентировочно при >50M записей или >50 одновременных аналитических запросов).

#### Запись событий
Все события пишутся через единый сервис `lib/events/track.ts`:
```ts
trackEvent({
  orgId, subscriberId, type: 'flow.entered',
  properties: { flowId, triggerType: 'start_command' },
});
```
Внутри — batch-вставка (буфер 100 событий или 1с), чтобы не блокировать горячий путь.

### 4.3 Аналитические отчёты

#### MVP-набор дашбордов (Этап 3–4)

**A. Обзор (главный экран)**
- Подписчики: всего / активных за 7д / новых за период / отписалось.
- Сообщения: отправлено / доставлено / прочитано / ответили.
- Топ-5 воронок по конверсии.
- Источники трафика (top 10 по UTM source).

**B. Источники / UTM**
- Таблица: `utm_source × utm_medium × utm_campaign` → подписчиков, конверсия в покупку, выручка.
- Pivot по любым UTM-полям, включая кастомные (`customFields.partner_id` и т.д.).
- Графики динамики по дням.

**C. Воронки**
- Для каждой `Flow`: дерево нод с цифрами «вошло / прошло / отвалилось» на каждом шаге.
- Heatmap дроп-офф.
- Среднее время прохождения.

**D. Рассылки**
- На каждый `Broadcast`: доставлено / прочитано / клики по кнопкам / отписалось после.
- A/B-сравнение (если включено).

**E. Когорты**
- Сетка: неделя подписки × неделя активности → % сохранения.

**F. Сегменты**
- Конструктор фильтров (tag + variable + событие в окне X дней).
- Сохранение как `Segment`.
- Использование в рассылках и триггерах.

**G. Финансы (если включены платежи)**
- LTV по когортам.
- Выручка по UTM-источникам (с выбранной моделью атрибуции).
- Конверсия в первую покупку / в повторную.

#### Архитектура подсчёта
- **Реалтайм** (последние 60 минут): прямые `SELECT` из `Event` с агрегацией.
- **Дневные/недельные/месячные агрегаты:** cron-джоб каждые 5 минут пересчитывает таблицу `EventDailyAggregate(orgId, date, dimensions JSON, metrics JSON)`.
- Дашборды читают агрегаты, фильтры применяются на агрегатах (быстро) или сырых событиях (медленно, для редких разрезов).

### 4.4 A/B-тестирование

```prisma
model AbTest {
  id            String  @id @default(cuid())
  orgId         String
  name          String
  variants      Json    // [{ id, name, weight, content }]
  status        String  // running / paused / finished
  winnerId      String?
  startedAt     DateTime?
  finishedAt    DateTime?
}
```

В воронке: нода `ab_split` с N вариантами и весами → каждый `FlowRun` детерминированно (через hash от `subscriberId+abTestId`) попадает в один из вариантов. Метрика выигрыша — конверсия в заданное событие (например, `payment.succeeded`) в окне X дней.

В рассылках: создаём 2 черновика сообщения, выбираем долю аудитории для теста (например, 20% → 10% / 10%), через сутки автоматически отправляем «победителя» оставшимся 80%.

### 4.5 Сегментация

Сегмент = сохранённый фильтр, оценивается на лету при отправке.

```prisma
model Segment {
  id            String  @id @default(cuid())
  orgId         String
  botId         String?  // null = по всем ботам
  name          String
  filter        Json     // см. формат ниже
  isDynamic     Boolean  @default(true)  // false = снапшот
  memberCount   Int      @default(0)     // кэш, обновляется по cron
  updatedAt     DateTime @updatedAt
}
```

**Формат фильтра:**
```json
{
  "and": [
    { "tag": { "in": ["paid_client", "active"] } },
    { "variable": { "key": "city", "eq": "Москва" } },
    { "event": { "type": "payment.succeeded", "in_last_days": 30 } },
    { "not": { "tag": { "in": ["unsubscribed"] } } },
    { "utm": { "field": "utm_source", "eq": "instagram" } }
  ]
}
```

Парсер фильтра → SQL-запрос. Базовая реализация: рекурсивный обход дерева, в `WHERE` строятся `EXISTS`-сабкверли по `Event` для условий на события.

---

## 5. Публичный REST API

### 5.1 Принципы
- **Версионирование с первого дня:** `/api/public/v1/...`.
- **Аутентификация:** API-ключ через `Authorization: Bearer <key>` (для server-to-server) + OAuth2 (для интеграций третьих сторон) во второй итерации.
- **Идемпотентность:** для POST-ресурсов через `Idempotency-Key` header.
- **Rate-limit:** на токен — 100 req/min по умолчанию, поднимаем по тарифу.
- **Формат:** JSON, snake_case в полях, ISO 8601 в датах, cursor-based пагинация.
- **Документация:** OpenAPI 3.1 → Scalar/Stoplight для интерактивных доков.
- **SDK:** автоген TS/Python из OpenAPI.

### 5.2 Модель ключей
```prisma
model ApiKey {
  id            String   @id @default(cuid())
  orgId         String
  name          String
  keyPrefix     String   // первые 8 символов — для UI ("prv_live_a1b2c3...")
  keyHash       String   // bcrypt от полного ключа
  scopes        String[] // ["subscribers:read", "broadcasts:write", ...]
  lastUsedAt    DateTime?
  expiresAt     DateTime?
  createdAt     DateTime @default(now())
  revokedAt     DateTime?

  @@index([keyPrefix])
}
```

### 5.3 Эндпоинты MVP

#### Подписчики
```
GET    /v1/subscribers                    список с фильтрами
GET    /v1/subscribers/{id}               один подписчик
PATCH  /v1/subscribers/{id}               обновить теги/переменные
POST   /v1/subscribers/{id}/tags          добавить тег
DELETE /v1/subscribers/{id}/tags/{tag}    убрать тег
POST   /v1/subscribers/{id}/messages      отправить сообщение
POST   /v1/subscribers/{id}/flows/{flowId}  запустить воронку для подписчика
```

#### Сегменты
```
GET    /v1/segments
POST   /v1/segments                       создать сегмент
GET    /v1/segments/{id}/members          участники сегмента
```

#### Воронки
```
GET    /v1/flows
GET    /v1/flows/{id}
POST   /v1/flows/{id}/runs                запустить для конкретного subscriber
```

#### Рассылки
```
GET    /v1/broadcasts
POST   /v1/broadcasts                     создать (статус=draft)
POST   /v1/broadcasts/{id}/send           отправить (немедленно или schedule)
GET    /v1/broadcasts/{id}/stats          статистика
```

#### Ссылки и аналитика
```
GET    /v1/tracking-links
POST   /v1/tracking-links                 создать ссылку с UTM и custom fields
GET    /v1/tracking-links/{id}/clicks
```

#### События
```
POST   /v1/events                         записать кастомное событие (для внешних систем)
GET    /v1/events                         выборка с фильтрами (для своего BI)
GET    /v1/analytics/reports/{name}       готовые отчёты (overview, sources, funnel, ...)
```

#### Webhooks (исходящие)
```
GET    /v1/webhooks
POST   /v1/webhooks                       подписаться на события (events[], url, secret)
DELETE /v1/webhooks/{id}
```

#### Боты и оргсетап
```
GET    /v1/bots
GET    /v1/bots/{id}
GET    /v1/me                             текущая организация и лимиты
```

### 5.4 Исходящие вебхуки

Школа регистрирует URL, подписывается на события (любые из event stream). Доставка:
- POST на их URL, payload = `{ event: {...}, signature: "sha256=..." }`.
- Подпись — HMAC-SHA256 от тела + секрет из `Webhook.secret`.
- Ретраи: 1мин, 5мин, 30мин, 2ч, 12ч (5 попыток). После — пометка `disabled` и алерт.
- Логи в `WebhookDelivery(webhookId, eventId, status, httpCode, response, attemptedAt)`.

```prisma
model Webhook {
  id            String   @id @default(cuid())
  orgId         String
  url           String
  secret        String
  events        String[] // ["subscriber.created", "payment.succeeded", ...]
  isActive      Boolean  @default(true)
  failureCount  Int      @default(0)
  lastSuccessAt DateTime?
  lastFailureAt DateTime?
  createdAt     DateTime @default(now())
}

model WebhookDelivery {
  id            String   @id @default(cuid())
  webhookId     String
  eventType     String
  payload       Json
  status        String   // pending / success / failed
  httpCode      Int?
  response      String?
  attempt       Int      @default(0)
  nextAttemptAt DateTime?
  deliveredAt   DateTime?
}
```

### 5.5 SDK (генерируется из OpenAPI)
Пример использования:
```ts
import { Proryv } from '@proryv/sdk';

const client = new Proryv({ apiKey: process.env.PROVRYV_KEY });

await client.subscribers.addTag('sub_123', 'paid_client');
await client.broadcasts.send({
  segmentId: 'seg_456',
  message: { text: 'Привет!', buttons: [...] },
});
```

---

## 6. Конструктор воронок (минимально для контекста)

> Полная спецификация в отдельном документе, здесь — связки с маркетингом.

### 6.1 Типы нод (MVP — 10 нод)
1. `message` — текст / медиа / кнопки
2. `condition` — if/else по тегам/переменным/событиям
3. `delay` — пауза N секунд/часов/дней
4. `set_variable` / `add_tag` / `remove_tag`
5. `wait_for_reply` — ожидание ответа с таймаутом
6. `http_request` — внешний вебхук
7. `ai_reply` — ответ через OpenClaw RAG
8. `ab_split` — A/B-тест
9. `payment` — создание счёта YooKassa / TG Payments
10. `goto_flow` / `end`

### 6.2 Триггеры входа в воронку
- Команда `/start` (с конкретным payload или любая)
- Ключевое слово в сообщении (regex)
- Клик по inline-кнопке
- Добавление тега
- Подписка на бот
- **LMS-события** (киллер-фича): `course.purchased`, `homework.submitted`, `certificate.issued` и т.д.
- API-вызов (`POST /v1/flows/{id}/runs`)
- Расписание (cron)

### 6.3 Маркетинговые события из воронки
Каждое прохождение ноды → `Event` типа `flow.node_executed`. Это автоматом даёт нам:
- Конверсию между нодами
- Время на каждом шаге
- Drop-off без отдельной разметки

---

## 7. Архитектура

### 7.1 Общая схема
```
┌──────────────┐      ┌──────────────────┐      ┌──────────────┐
│   Next.js    │─────▶│   PostgreSQL     │◀─────│  Worker(s)   │
│  (web + API) │      │  (state + events)│      │   (BullMQ)   │
└──────┬───────┘      └────────┬─────────┘      └──────┬───────┘
       │                       │                        │
       │              ┌────────▼─────────┐              │
       └─────────────▶│      Redis       │◀─────────────┘
                      │  (queue + cache) │
                      └──────────────────┘
                              │
                      ┌───────▼────────┐
                      │  Telegram API  │
                      └────────────────┘
```

### 7.2 Worker-процесс
**Отдельный Node-контейнер** (НЕ Vercel serverless), запускается из того же кодбейза:
- `worker/broadcast.ts` — отправка рассылок чанками с учётом TG rate limits (30 msg/s глобально, 1 msg/s на чат)
- `worker/flow-tick.ts` — продвижение FlowRun на следующую ноду (с учётом `delay`)
- `worker/webhook-deliver.ts` — доставка исходящих вебхуков с ретраями
- `worker/aggregates.ts` — пересчёт `EventDailyAggregate` каждые 5 минут
- `worker/inbound.ts` — обработка апдейтов от Telegram (входной webhook кладёт в очередь, воркер обрабатывает)

### 7.3 Telegram-стек
- **SDK:** `grammY` (типизированный, активно развивается, нативно работает с webhook).
- **Webhook endpoint:** `/api/telegram/webhook/[botToken]` или `[botId]` с проверкой `X-Telegram-Bot-Api-Secret-Token`.
- **Стратегия:** все апдейты → `EnqueueUpdate` в Redis → воркер обрабатывает. Хендлер вебхука отвечает 200 моментально, чтобы TG не делал ретраи.
- **Rate-limit на отправку:** локальный rate-limiter в воркере (через Redis token bucket).

### 7.4 Multi-tenancy
- Каждая `Organization` имеет `slug`, доступ по сабдомену (`{slug}.proryv.ru`) или префиксу пути (`/o/{slug}/...`) — решить.
- На уровне Prisma — `organizationId` на всех бизнес-моделях. Middleware проверяет `req.orgId` и подмешивает в каждый запрос.
- Рекомендация: использовать [Prisma extension](https://www.prisma.io/docs/orm/prisma-client/client-extensions) для автоматического `where: { organizationId }` — снижает шанс утечки.

### 7.5 Безопасность
- API-ключи хранятся как `bcrypt` хеш + prefix для UI.
- Telegram webhook secret в URL + проверка `X-Telegram-Bot-Api-Secret-Token`.
- HMAC-подпись исходящих вебхуков.
- Rate-limit на публичный API.
- Логирование всех action'ов оператора (audit log).
- 2FA уже есть — обязательна для админов организаций.

---

## 8. Модель данных (полный список новых моделей)

```
Organization              // мультитенантный корень
Membership                // user × org × role
ApiKey                    // API-токены
Plan / Subscription       // тарифы и подписки SaaS-биллинга

TgBot                     // подключенный бот
TgSubscriber              // подписчик бота
TgMessage                 // лог сообщений (in/out)

Flow                      // граф воронки
FlowRun                   // экземпляр выполнения воронки
FlowVersion               // версионирование (опц., этап 2)

TrackingLink              // ссылка с UTM
LinkClick                 // клики по ссылкам
SubscriberTouch           // полная история касаний (для linear-атрибуции, этап 4+)

Event                     // event stream
EventDailyAggregate       // агрегаты для дашбордов

Tag                       // справочник тегов
SubscriberTag             // many-to-many

Variable                  // справочник переменных + типы
SubscriberVariable        // значения

Segment                   // сохранённые фильтры
Broadcast (расширяем)     // + channel=telegram
BroadcastVariant          // для A/B
AbTest                    // тесты внутри воронок

Webhook                   // исходящие подписки
WebhookDelivery           // лог доставки

Payment                   // платежи внутри ботов
Product                   // справочник продуктов для оплаты

OperatorChat              // живой чат оператора (опц., переиспользуем Question)
```

---

## 9. Дорожная карта

### Этап 0 — Фундамент (1–2 недели)
**Цель:** сделать платформу мультитенантной и подготовить инфраструктуру.
- [ ] Модель `Organization` + миграция всех бизнес-моделей с `organizationId`.
- [ ] `Membership` + ролевая модель внутри org (owner/admin/operator/viewer).
- [ ] Маршрутизация по org (сабдомен или префикс — решить).
- [ ] BullMQ + worker-контейнер в docker-compose.
- [ ] Базовый `Event` + сервис `trackEvent()`.
- [ ] Базовая модель `ApiKey` + middleware аутентификации публичного API.

**Готово, когда:** существующая ЛМС работает как одна org, можно создавать новые org и в них приглашать пользователей.

### Этап 1 — Telegram inbound + подписчики (1 неделя)
- [ ] grammY, модели `TgBot`, `TgSubscriber`, `TgMessage`.
- [ ] Webhook endpoint + воркер обработки апдейтов.
- [ ] UI «подключить бота» (вставка токена → автоматическая проверка через `getMe`).
- [ ] Базовый список подписчиков с фильтрами и поиском.
- [ ] Запись событий `subscriber.created`, `message.received`, `subscriber.blocked_bot`.

**Готово, когда:** школа подключает своего бота, видит подписчиков, входящие сообщения логируются.

### Этап 2 — Рассылки + UTM-ссылки (1 неделя)
- [ ] Модель `TrackingLink` + UI создания ссылок.
- [ ] Атрибуция: на `/start <payload>` определяем `firstTouchLinkId`.
- [ ] Расширение `Broadcast`: канал `telegram`, кнопки, медиа.
- [ ] Воркер рассылки с учётом TG rate limits.
- [ ] Минимальный дашборд рассылки: доставлено / прочитано / клики.

**Готово, когда:** можно создать ссылку с UTM, разослать сообщение по сегменту, увидеть статистику.

### Этап 3 — Конструктор воронок (3 недели)
- [ ] Модели `Flow`, `FlowRun`, граф в JSON.
- [ ] Frontend на React Flow с 10 типами нод.
- [ ] Воркер `flow-tick`.
- [ ] Триггеры: `/start`, ключевое слово, тег, LMS-события.
- [ ] AI-узел через OpenClaw.
- [ ] Запись `flow.entered`, `flow.node_executed`, `flow.completed`, `flow.dropped`.

**Готово, когда:** можно собрать воронку из 10 нод, запустить триггером, увидеть прохождение в логе.

### Этап 4 — Маркетинговая аналитика (1.5 недели)
- [ ] Дашборды: Overview, Источники, Воронки, Рассылки, Когорты.
- [ ] Конструктор сегментов на фильтрах.
- [ ] Атрибуция first/last touch.
- [ ] `EventDailyAggregate` + cron пересчёта.

**Готово, когда:** школа видит выручку по UTM-источникам, конверсию воронки, удержание когорт.

### Этап 5 — Публичный API + Webhooks (1.5 недели)
- [ ] Все эндпоинты v1 из раздела 5.
- [ ] OpenAPI-спецификация + Scalar-документация.
- [ ] Исходящие вебхуки + воркер доставки.
- [ ] Rate-limit и логирование.
- [ ] TS SDK (автоген).

**Готово, когда:** внешний скрипт может через API добавить подписчика, запустить воронку, прочитать статистику.

### Этап 6 — Платежи и биллинг SaaS (2 недели)
- [ ] YooKassa-интеграция для двух уровней: оплаты внутри ботов И биллинга самого SaaS.
- [ ] Модели `Plan`, `Subscription`, `Payment`, `Product`.
- [ ] Нода `payment` в конструкторе.
- [ ] Биллинг-кабинет: тарифы, лимиты (подписчики/боты/сообщения), оплата.

**Готово, когда:** школа оплачивает наш тариф, продаёт через своего бота свой продукт, получает деньги на свой счёт.

### Этап 7 — Полировка и pre-launch (1–2 недели)
- [ ] Шаблоны воронок (3–5 готовых: вебинар, прогрев, реактивация).
- [ ] Импорт из BotHelp/SaleBot (CSV подписчиков + теги).
- [ ] Чат-оператор на базе Question-модуля.
- [ ] Audit log.
- [ ] Документация для пользователей.
- [ ] Лендинг и онбординг.

**Итого: ~12–14 недель до запуска полноценного SaaS.**

---

## 10. Биллинг SaaS — тарифная сетка (черновик)

| Тариф | Цена/мес | Подписчиков | Ботов | Воронок | Сообщений/мес | API-вызовов/день | Чат-операторы |
|---|---|---|---|---|---|---|---|
| **Free** | 0 ₽ | 100 | 1 | 1 | 1 000 | 100 | — |
| **Старт** | 990 ₽ | 1 000 | 1 | 5 | 30 000 | 1 000 | 1 |
| **Бизнес** | 2 990 ₽ | 5 000 | 3 | ∞ | 150 000 | 10 000 | 3 |
| **Школа** | 5 990 ₽ | 20 000 | 10 | ∞ | 500 000 | 50 000 | 10 |
| **Enterprise** | от 15 000 ₽ | ∞ | ∞ | ∞ | ∞ | ∞ | ∞ |

**Сверхлимиты:** оплата по факту (например, 0.1 ₽ за сообщение свыше квоты).

> Цифры — черновик, требуется конкурентный анализ и unit-economics.

---

## 11. Риски и митигации

| Риск | Вероятность | Impact | Митигация |
|---|---|---|---|
| Поздняя миграция на multi-tenant | средняя | критический | Делать Этапом 0, не откладывать |
| TG-баны за рассылки | высокая | высокий | Жёсткий rate-limit на воркере, opt-in верификация, обучение пользователей |
| Утечка данных между org | низкая | критический | Prisma extension с принудительным `where`, тесты на изоляцию, code review |
| Next.js 16 — свежий релиз | средняя | средний | Воркеры отдельным процессом, не привязываемся к новым фичам без необходимости |
| Сложность визуального редактора (UI) | высокая | средний | React Flow, начать с 5 нод, наращивать |
| Atribution edge-cases (юзер удалил/восстановил подписку) | средняя | низкий | Чёткие правила в коде + тесты |
| Большой объём событий → Postgres | средняя | высокий | Партиции с 5M строк, план перехода на ClickHouse |
| 152-ФЗ / персональные данные | низкая (мы РФ) | критический | Soft-delete с обфускацией, экспорт по запросу субъекта, согласие при подписке |
| Конкуренты копируют фичи | высокая | средний | Скорость + интеграция с LMS + API как моат |
| AI-узел галлюцинирует | высокая | средний | Только RAG (не свободная генерация), feedback-кнопки, fallback на оператора |

---

## 12. KPI / метрики успеха

### Продуктовые (внутренние)
- Time-to-first-broadcast (от регистрации до первой отправки): целевое <30 минут
- Time-to-first-flow (создание первой воронки): <2 часа
- API uptime: 99.5% MVP, 99.9% к этапу 7
- p95 задержка отправки сообщения через рассылку: <60 секунд
- p95 задержка `flow_tick`: <10 секунд после триггера (для нод без `delay`)

### Бизнес-метрики (после запуска)
- Активаций (бот подключён + первое сообщение): X в месяц
- Конверсия Free → платный: целевая 5–10%
- MRR через 6 мес: TBD
- Отток (churn) платных: <5% в месяц
- NPS: >40

---

## 13. Открытые вопросы для обсуждения

> **Это главный раздел для встречи завтра.**

### Стратегия
1. **Делаем ли мы биллинг SaaS сразу или сначала запускаем как фичу для своей школы и продаём по запросу?** Второй вариант проще, экономит этап 6, но замедляет монетизацию.
2. **Сабдомены или префиксы пути для org?** (`school.proryv.ru` vs `proryv.ru/o/school`). Сабдомены — выглядит профессиональнее, но усложняет SSL/деплой.
3. **Кастомные домены под бота (white-label лендинги внутри бота)?** Это премиум-фича, нужна ли в MVP?
4. **Цены — на подписчиков или на сообщения?** BotHelp — на подписчиков, SaleBot — гибрид. На подписчиков проще, на сообщения честнее. Решить.

### Продукт
5. **Сколько нод в MVP конструктора?** Я заложил 10. Можно сократить до 6 (без `ai_reply`, `ab_split`, `payment`, `http_request`) и закрыть Этап 3 за 2 недели вместо 3.
6. **AI-узел как киллер-фича — насколько вкладываемся в OpenClaw для этого?** Нужно ли отдельно обучать модели на данных школы (платная фича)?
7. **Линейная атрибуция в MVP или только first/last?** Linear требует хранения всех касаний — заметно увеличит объём данных.
8. **Какой минимальный набор готовых шаблонов воронок выпускаем?** Список 3–5 шаблонов.

### Технические
9. **ClickHouse — закладывать сразу или ждать упора в Postgres?** Сразу — лишняя инфра. Потом — миграция.
10. **Версионирование воронок (Flow vs FlowVersion) — в MVP или нет?** Без версий проще, но опасно для прода (изменил → сломал текущие FlowRun).
11. **Telegram Payments или только YooKassa?** Telegram Payments удобнее в боте, но требуют поддержки в провайдере.
12. **Поддержка нескольких языков интерфейса (i18n)?** Только русский на старте или сразу с заделом на en?

### Команда и процесс
13. **Сколько разработчиков выделяем?** Все сроки в документе — для 1 фуллстек-разработчика на 100%. С двумя — кратно быстрее по этапам, которые распараллеливаются (frontend конструктора + backend движка).
14. **Кто отвечает за дизайн UI?** Особенно конструктор воронок и дашборды — это много экранов.
15. **Когда подключаем первых пилотных клиентов?** Предлагаю после Этапа 4 (есть рассылки + аналитика, но без полного конструктора).
16. **Будем ли публично анонсировать roadmap или работаем тихо?**

### Юридика и compliance
17. **Оферта SaaS** — нужна готовая. Кто пишет?
18. **Хранение данных в РФ** — у нас всё в РФ (хорошо), но Telegram outbound идёт за рубеж. Достаточно ли согласия?
19. **Антиспам-политика** — наши правила использования. Если школу банят за спам, что мы делаем?

---

## 14. Приложения

### A. Ссылки на ключевые файлы текущего проекта
- [prisma/schema.prisma](prisma/schema.prisma) — текущая схема (733 строки)
- [lib/telegram.ts](lib/telegram.ts) — текущая outbound-интеграция
- [lib/redis.ts](lib/redis.ts) — Redis-клиент
- [lib/rate-limit.ts](lib/rate-limit.ts) — паттерн rate-limiting
- [app/api/bitrix/](app/api/bitrix/) — пример вебхук-интеграции
- [app/api/ai/](app/api/ai/) — OpenClaw RAG endpoint
- [docker-compose.yml](docker-compose.yml) — текущая инфра

### B. Внешние ссылки
- [grammY (Telegram bot framework)](https://grammy.dev)
- [BullMQ](https://docs.bullmq.io)
- [React Flow](https://reactflow.dev)
- [Scalar API docs](https://scalar.com)
- [Prisma client extensions](https://www.prisma.io/docs/orm/prisma-client/client-extensions)
- [Telegram Bot API rate limits](https://core.telegram.org/bots/faq#broadcasting-to-users)

### C. Глоссарий
- **Org / Organization** — клиент SaaS (онлайн-школа), верхний уровень изоляции.
- **Subscriber** — конечный пользователь бота (ученик/лид школы).
- **Flow** — воронка, граф нод.
- **FlowRun** — одно прохождение воронки конкретным подписчиком.
- **Touch** — событие касания подписчика с UTM-ссылкой.
- **Attribution** — модель распределения заслуги конверсии между касаниями.
- **TrackingLink** — ссылка с UTM-параметрами.
- **Segment** — фильтр-сегмент подписчиков.
- **Broadcast** — массовая рассылка.

---

*Конец документа. Авторы: Claude + alpenovDcode. Версия: 0.1, draft.*
