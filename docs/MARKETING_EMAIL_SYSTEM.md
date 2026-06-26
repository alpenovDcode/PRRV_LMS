# Marketing Email System — Design Spec

**Дата:** 2026-06-26 (обновлено после анализа архитектуры)
**Автор:** Платформенная команда
**Статус:** одобренный дизайн, готов к разработке

---

## 1. Контекст

Платформа Прорыв LMS мигрировала с GetCourse на собственный стек. Транзакционные письма (открытие доступа, оплата, проверка ДЗ, сертификаты) работают через `kpc@prrv.tech` на Yandex 360 SMTP и закрывают потребность.

Маркетинговые рассылки на GetCourse остались как «прогретый ящик», который технически перенести нельзя — почта принадлежит GitКурсу, прогревается домен, а не адрес. На созвоне с Unisender (Андрей + Евгений Плешивцев) подтвердили: единственный путь — поднять собственный поддомен (`mail.prrv.tech`), настроить SPF/DKIM/DMARC, **прогреть с нуля** и работать через специализированный сервис.

Закупка сервиса, прогрев домена, заказ услуг Unisender и согласование с руководством — на ответственном за маркетинг (Евгений, в отпуске). От платформенной команды требуется **техническая инфраструктура «точь-в-точь как раздел Рассылки у GetCourse»** к моменту его возвращения. Подключение Unisender — буквально подмена env-переменной.

---

## 2. Цели и не-цели

### Цели
- Полноценный маркетинговый модуль в админке `/admin/marketing/*`, по фичам ≥ GetCourse Рассылок.
- Архитектура с подключаемым провайдером доставки. Сейчас — наш Yandex SMTP (для тестов и узких сегментов). Подменой `EMAIL_MARKETING_PROVIDER=unisender` подключается Unisender.
- Базовые модули: контакты, сегменты, визуальный блочный редактор писем, кампании, аналитика, автоматизации (триггерные цепочки).
- Безопасное масштабирование на 70К+ контактов через **cron-sidecar pattern + БД-jobs** (как уже работающий `tg-cron`): батчи, ретраи с exponential backoff, паузы, прогресс в реальном времени.
- Полная аналитика: открытия (pixel), клики (redirect), отписки, bounce, жалобы.
- Готовность к Unisender API: модели полей `externalContactId`, `providerListId`, `providerCampaignId`; webhook-приёмник с адаптерами под провайдеров.

### Не-цели
- Замена транзакционного канала. Текущий `lib/email-service.ts` + Yandex SMTP остаётся для всех событийных писем (welcome от админки, ДЗ, оплата, сертификат и т.д.).
- Прогрев домена, настройка DNS, дизайн писем под бренд, копирайтинг, согласование стратегии — это закрывается услугами Unisender и работой маркетолога.
- Перенос существующих в коде `Broadcast` сразу: они продолжают работать как было; миграция в новую структуру `EmailCampaign` — опциональный Спринт 7 после стабилизации.

---

## 3. Архитектурные принципы

### 3.1. Подключаемый провайдер

```
                       ┌─────────────────────────────┐
   Админка ──────────► │   EmailProvider interface    │
   /admin/marketing/   │                              │
                       │  send(), getStats(),         │
                       │  syncContact(), webhook()    │
                       └──────────────┬───────────────┘
                                      │
                ┌─────────────────────┼─────────────────────┐
                ▼                     ▼                     ▼
         YandexSmtpProvider    UnisenderProvider     (future providers)
         (работает сразу,      (заготовка под
         через текущий         API-ключ + DNS)
         lib/email-service.ts)
```

Провайдер резолвится фабрикой `lib/email/providers/factory.ts` на основе `EMAIL_MARKETING_PROVIDER` (`yandex` | `unisender`). UI и БД-слой провайдера не знают.

### 3.2. Очередь — cron-sidecar pattern

Используем тот же паттерн, что и `tg-cron` в проекте: отдельный Docker-контейнер курлит `/api/email-cron/tick` каждые 10 секунд с Bearer-секретом. Handler читает из БД `EmailDeliveryJob` со статусом `pending`/`retrying`, обрабатывает батч из N штук, обновляет статус и счётчики в `EmailCampaign.stats`. Retry с exponential backoff (4 попытки: +30 сек, +5 мин, +30 мин, +2 часа) пишется в БД-полях `nextAttemptAt` и `attemptCount`.

Плюсы по сравнению с BullMQ для нашего объёма (70К база, 1–4 кампании в неделю):
- 0 новых зависимостей (Redis-клиент `redis` уже стоит, ioredis не требуется).
- Восстанавливаемость: статус каждой задачи в Postgres — после падения worker'а ничего не теряется.
- Видимость: обычный SQL + существующий `/admin/monitoring`.
- Деплой/operations: blue-green уже настроен под этот паттерн в `docker-compose.prod.yml`.

---

## 4. Модель данных (Prisma)

> Все идентификаторы — `uuid` (как везде в проекте), не cuid. snake_case maps обязательны.

### 4.1. Расширения существующих моделей

```prisma
model User {
  // существующие поля...

  externalContactId   String?   @unique @map("external_contact_id") // id во внешнем провайдере (Unisender contact)
  contactSyncedAt     DateTime? @map("contact_synced_at")
  emailValidated      Boolean   @default(false) @map("email_validated") // прошёл валидацию провайдера
  marketingOptOut     Boolean   @default(false) @map("marketing_opt_out") // глобальный отказ от маркетинга
  unsubscribedAt      DateTime? @map("unsubscribed_at")
  unsubscribeToken    String?   @unique @map("unsubscribe_token")  // для one-click из писем
  emailTags           Json?     @map("email_tags") // ["tariff:VR","track:music","stage:onboarding"]
  // lastActiveAt уже есть в схеме — начнём его выставлять при login
}

model BroadcastRecipient {
  // существующие lmsStatus, emailStatus, errorMessage...

  deliveredAt       DateTime? @map("delivered_at")
  openedAt          DateTime? @map("opened_at")
  openCount         Int       @default(0) @map("open_count")
  clickedAt         DateTime? @map("clicked_at")
  clickCount        Int       @default(0) @map("click_count")
  bouncedAt         DateTime? @map("bounced_at")
  bounceType        String?   @map("bounce_type") // soft|hard
  bounceReason      String?   @map("bounce_reason")
  unsubscribedAt    DateTime? @map("unsubscribed_at")
  spamReportedAt    DateTime? @map("spam_reported_at")
  providerMessageId String?   @map("provider_message_id")
}
```

Существующая `EmailTemplate` (event-based для транзакционок) **остаётся как есть** — она используется в `sendTemplateEmail()` для `USER_CREATED_BY_ADMIN` и `COURSE_ACCESS_GRANTED`. Не трогаем. Новый блочный редактор — другая модель.

### 4.2. Новые модели

```prisma
model EmailCampaign {
  id                  String   @id @default(uuid())
  name                String
  subject             String
  preheader           String?
  fromName            String   @map("from_name")
  fromEmail           String   @map("from_email")
  templateId          String?  @map("template_id")
  segmentId           String?  @map("segment_id")
  status              String   @default("draft") // draft|scheduled|sending|sent|paused|failed|cancelled
  scheduledAt         DateTime? @map("scheduled_at")
  startedAt           DateTime? @map("started_at")
  finishedAt          DateTime? @map("finished_at")
  abTest              Json?    @map("ab_test")  // { variants: [{subject, percentage}], winnerMetric, winnerAt }
  stats               Json     @default("{}")   // { recipients, sent, delivered, opened, clicked, unsubscribed, bounced, spam }
  providerCampaignId  String?  @map("provider_campaign_id")
  createdBy           String   @map("created_by")
  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @updatedAt @map("updated_at")

  template            EmailVisualTemplate? @relation(fields: [templateId], references: [id])
  segment             EmailSegment?        @relation(fields: [segmentId], references: [id])
  deliveryJobs        EmailDeliveryJob[]
  events              EmailEvent[]

  @@index([status, scheduledAt])
  @@map("email_campaigns")
}

model EmailVisualTemplate {
  id            String   @id @default(uuid())
  name          String
  category      String   @default("marketing") // marketing|warmup
  subject       String
  preheader     String?
  blocks        Json     // TipTap JSON для редактора
  compiledHtml  String   @db.Text @map("compiled_html") // готовый email-safe HTML
  thumbnailUrl  String?  @map("thumbnail_url")
  isArchived    Boolean  @default(false) @map("is_archived")
  createdBy     String   @map("created_by")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")
  campaigns     EmailCampaign[]

  @@map("email_visual_templates")
}

model EmailSegment {
  id              String   @id @default(uuid())
  name            String
  description     String?
  filters         Json     // { role, tariff, track, group, enrolledIn, lessonProgressMin, lastActiveDays, tags, hasKeyword }
  contactCount    Int      @default(0) @map("contact_count")
  providerListId  String?  @map("provider_list_id")
  syncedAt        DateTime? @map("synced_at")
  createdBy       String   @map("created_by")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")
  campaigns       EmailCampaign[]

  @@map("email_segments")
}

// Очередь отправки — обрабатывается cron-sidecar'ом
model EmailDeliveryJob {
  id             String   @id @default(uuid())
  campaignId     String   @map("campaign_id")
  userId         String?  @map("user_id")
  email          String
  variables      Json     @default("{}") // переменные для подстановки в шаблон
  status         String   @default("pending") // pending|retrying|sent|failed|cancelled
  attemptCount   Int      @default(0) @map("attempt_count")
  nextAttemptAt  DateTime @default(now()) @map("next_attempt_at") // когда воркер заберёт следующий раз
  lastError      String?  @map("last_error")
  sentAt         DateTime? @map("sent_at")
  providerMessageId String? @map("provider_message_id")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")
  campaign       EmailCampaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)

  @@index([status, nextAttemptAt])  // воркер берёт WHERE status IN ('pending','retrying') AND next_attempt_at <= NOW()
  @@index([campaignId, status])
  @@map("email_delivery_jobs")
}

model EmailAutomation {
  id           String   @id @default(uuid())
  name         String
  trigger      String   // user_registered|course_purchased|inactive_30d|course_completed|birthday
  triggerData  Json?    @map("trigger_data")
  steps        Json     // [{delayHours, templateId, conditions}]
  isActive     Boolean  @default(false) @map("is_active")
  stats        Json     @default("{}")
  createdBy    String   @map("created_by")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")
  runs         EmailAutomationRun[]

  @@map("email_automations")
}

model EmailAutomationRun {
  id            String   @id @default(uuid())
  automationId  String   @map("automation_id")
  userId        String   @map("user_id")
  currentStep   Int      @default(0) @map("current_step")
  nextStepAt    DateTime @default(now()) @map("next_step_at") // когда продвигать
  status        String   @default("running") // running|completed|cancelled|failed
  startedAt     DateTime @default(now()) @map("started_at")
  completedAt   DateTime? @map("completed_at")
  automation    EmailAutomation @relation(fields: [automationId], references: [id], onDelete: Cascade)

  @@index([userId, automationId])
  @@index([status, nextStepAt])
  @@map("email_automation_runs")
}

model EmailEvent {
  id                String   @id @default(uuid())
  userId            String?  @map("user_id")
  email             String
  campaignId        String?  @map("campaign_id")
  recipientId       String?  @map("recipient_id")
  type              String   // sent|delivered|opened|clicked|bounced|spam|unsubscribed
  url               String?  // для click-события
  userAgent         String?  @map("user_agent")
  ipHash            String?  @map("ip_hash") // sha256(ip + salt), не raw
  providerEventId   String?  @unique @map("provider_event_id") // дедуп webhook'ов
  metadata          Json?
  occurredAt        DateTime @default(now()) @map("occurred_at")
  createdAt         DateTime @default(now()) @map("created_at")
  campaign          EmailCampaign? @relation(fields: [campaignId], references: [id], onDelete: Cascade)

  @@index([userId, type])
  @@index([campaignId, type, occurredAt])
  @@map("email_events")
}

model EmailContactImport {
  id            String   @id @default(uuid())
  fileName      String   @map("file_name")
  rowsTotal     Int      @map("rows_total")
  rowsImported  Int      @map("rows_imported")
  rowsSkipped   Int      @map("rows_skipped")
  errors        Json     @default("[]")
  segmentId     String?  @map("segment_id")
  createdBy     String   @map("created_by")
  createdAt     DateTime @default(now()) @map("created_at")

  @@map("email_contact_imports")
}
```

---

## 5. Бэкенд

### 5.1. Структура файлов

```
lib/email/
├── providers/
│   ├── types.ts              # EmailProvider interface + типы
│   ├── yandex-smtp.ts        # обёртка над текущим lib/email-service.ts
│   ├── unisender.ts          # заготовка с реальными API-методами
│   └── factory.ts            # resolveProvider() по env
├── tracking/
│   ├── open-pixel.ts         # генератор tracking-пикселя в HTML
│   ├── click-wrapper.ts      # оборачивание всех ссылок письма в /api/email/track/click
│   └── unsubscribe-token.ts  # generate/verify одноразовые токены
├── compiler/
│   ├── blocks-to-html.ts     # TipTap JSON → email-safe HTML с inline CSS, table layout
│   ├── variables.ts          # {{firstName}} {{course.title}} рендер
│   └── preview.ts            # desktop/mobile preview helper
├── segments/
│   ├── compile-filters.ts    # EmailSegment.filters → Prisma where
│   ├── preview-size.ts       # быстрый count без выгрузки данных
│   └── sync-to-provider.ts   # выгрузка списка в провайдера
├── queue/
│   ├── process-campaigns.ts  # processDueDeliveryJobs() — забирает take(100) из EmailDeliveryJob,
│   │                         #                            отправляет батч, обновляет статус
│   ├── process-automations.ts # processDueAutomationRuns() — продвигает шаги цепочек
│   ├── enqueue-campaign.ts   # создаёт EmailDeliveryJob записи на основе сегмента
│   └── retry-policy.ts       # exponential backoff: +30s, +5m, +30m, +2h, после 4-х → failed
├── automations/
│   ├── trigger-router.ts     # listener событий platform → запуск AutomationRun
│   └── triggers/
│       ├── user-registered.ts
│       ├── course-purchased.ts
│       └── inactive-period.ts
├── security/
│   └── constant-time-compare.ts  # переиспользуемая утилита (вынесена из middleware и tg-cron/tick)
└── analytics/
    ├── campaign-stats.ts     # агрегаты из EmailEvent
    └── contact-history.ts    # история одного контакта
```

### 5.2. API endpoints

```
# Публичные (в middleware whitelist, auth внутри роута)
app/api/email/track/open/[recipientId]/route.ts        # GET 1×1 GIF, асинхронная запись в EmailEvent
app/api/email/track/click/[recipientId]/route.ts       # GET → 302 redirect + запись в EmailEvent
app/api/email/unsubscribe/[token]/route.ts             # GET форма + POST подтверждение
app/api/email/webhook/[provider]/route.ts              # POST приём webhook, HMAC внутри роута

# Cron sidecar endpoint
app/api/email-cron/tick/route.ts                       # POST, Bearer EMAIL_CRON_SECRET
                                                       # внутри: processDueDeliveryJobs() + processDueAutomationRuns()

# Админ API (withAuth + role:admin)
app/api/admin/marketing/
├── campaigns/
│   ├── route.ts                        # GET список, POST создать
│   ├── [id]/route.ts                   # GET/PATCH/DELETE
│   ├── [id]/send/route.ts              # POST запустить (enqueue jobs)
│   ├── [id]/pause/route.ts             # POST status=paused
│   ├── [id]/resume/route.ts            # POST status=sending
│   └── [id]/stats/route.ts             # GET воронка/топ кликов
├── templates/
│   ├── route.ts
│   ├── [id]/route.ts
│   ├── [id]/preview/route.ts           # POST { variables } → HTML
│   └── [id]/duplicate/route.ts
├── segments/
│   ├── route.ts
│   ├── [id]/route.ts
│   ├── preview/route.ts                # POST { filters } → count + sample
│   └── [id]/sync/route.ts              # POST синхронизировать с провайдером
├── contacts/
│   ├── route.ts                        # GET с фильтрами и пагинацией
│   ├── [id]/route.ts                   # GET с историей событий
│   ├── [id]/unsubscribe/route.ts       # POST ручная отписка из админки
│   ├── import/route.ts                 # POST CSV upload
│   └── export/route.ts                 # GET CSV по сегменту
├── automations/
│   ├── route.ts
│   ├── [id]/route.ts
│   ├── [id]/activate/route.ts
│   └── [id]/runs/route.ts
└── stats/
    ├── overview/route.ts               # dashboard метрики
    └── deliverability/route.ts         # delivery rate, complaint rate
```

### 5.3. EmailProvider interface

```ts
// lib/email/providers/types.ts
export interface EmailProvider {
  readonly name: 'yandex' | 'unisender'

  sendOne(params: {
    to: string
    subject: string
    html: string
    fromName: string
    fromEmail: string
    headers?: Record<string, string>
  }): Promise<{ providerMessageId?: string }>

  syncContact?(user: User): Promise<{ externalContactId: string }>
  unsubscribeContact?(email: string): Promise<void>
  validateEmails?(emails: string[]): Promise<ValidationResult[]>
  getCampaignStats?(providerCampaignId: string): Promise<CampaignStats>

  verifyWebhookSignature?(headers: Headers, rawBody: string): boolean
  parseWebhookEvent?(payload: any): EmailEventData[]
}
```

Все методы кроме `sendOne` опциональны — Yandex SMTP не умеет, например, синхронизировать контакты или присылать webhook'и. UI скрывает или подменяет undefined-методы на noop.

### 5.4. Middleware whitelist

В [middleware.ts:44-74](middleware.ts:44) добавить публичные роуты:

```ts
path.startsWith("/api/email/track/") ||         // open pixel + click — public
path.startsWith("/api/email/unsubscribe/") ||   // публичная страница отписки
path.startsWith("/api/email/webhook/") ||       // от провайдера, HMAC внутри роута
path.startsWith("/api/email-cron/")             // sidecar, Bearer secret
```

И для пользовательского /email/unsubscribe/[token] страницы — она тоже public:

```ts
path.startsWith("/email/unsubscribe/") ||
```

---

## 6. Фронтенд

### 6.1. Структура страниц

```
app/admin/marketing/
├── layout.tsx                       # внутренний sidebar раздела
├── page.tsx                         # Dashboard
├── campaigns/
│   ├── page.tsx                     # Список
│   ├── new/page.tsx                 # Wizard 4 шага
│   └── [id]/page.tsx                # Детальная страница кампании
├── segments/
│   ├── page.tsx                     # Список сегментов
│   ├── new/page.tsx                 # Конструктор фильтров
│   └── [id]/edit/page.tsx
├── templates/
│   ├── page.tsx                     # Галерея превью-карточек
│   ├── new/page.tsx                 # Выбор стартового макета
│   └── [id]/edit/page.tsx           # Блочный редактор TipTap
├── contacts/
│   ├── page.tsx                     # Таблица с фильтрами + теги
│   ├── import/page.tsx              # CSV upload + маппинг полей
│   └── [id]/page.tsx                # История взаимодействий
├── automations/
│   ├── page.tsx                     # Список
│   └── [id]/edit/page.tsx           # Редактор цепочки
└── settings/page.tsx                # Провайдер, домен, DNS, webhook URL
```

В существующий sidebar [components/layouts/admin-layout.tsx](components/layouts/admin-layout.tsx) добавляется новый пункт `Megaphone → /admin/marketing`. Старые `Send → /admin/broadcasts` и `Mail → /admin/email-templates` **остаются** до Спринта 7. Когда модуль будет стабилен — старые превращаем в редиректы внутрь /admin/marketing/.

### 6.2. Блочный редактор писем

**Стек:** TipTap 3.19 (уже в проекте) + кастомные node-ы. Дополнительных зависимостей не требует.

**Блоки (node-ы):**
- `heading` — H1/H2/H3 с настройкой размера, цвета, выравнивания
- `text` — параграф с rich text
- `button` — кнопка с URL, цветом, размером, скруглением
- `image` — картинка с URL/загрузкой в Cloudflare R2 (используем существующий загрузчик)
- `divider` — горизонтальная линия
- `spacer` — отступ настраиваемой высоты
- `columns` — 2/3 колонки с вложенными блоками
- `social` — иконки соцсетей с ссылками
- `footer` — подпись + обязательный unsubscribe-link с `{{unsubscribeUrl}}`

**Компилятор `blocks-to-html.ts`:**
- Принимает TipTap JSON документ
- Генерирует HTML с inline-стилями (требование почтовиков)
- Использует table-based layout (MSO-совместимость с Outlook)
- Подставляет `{{unsubscribeUrl}}`, `{{viewInBrowserUrl}}`, любые `{{var}}`
- Оборачивает ссылки в `{{trackingPrefix}}/click/...`
- Вставляет tracking-пиксель `{{trackingPrefix}}/open/{{recipientId}}.gif`
- Прогоняет user-content через `sanitize-html` (как уже делается в [lib/email-service.ts:54-189](lib/email-service.ts:54))

**Превью:**
- Тогглер desktop / mobile / dark mode
- iframe с готовым HTML
- Подстановка тестовых значений переменных
- Кнопка «отправить тестовое письмо на мой адрес» (через YandexSmtpProvider)

### 6.3. Wizard кампании (UX)

1. **Получатели:** выбрать существующий сегмент или собрать на лету. Live preview «затронет N человек».
2. **Контент:** выбрать шаблон или создать новый прямо в шаге (открывается редактор в модалке).
3. **Настройки:** тема, прехедер, fromName/fromEmail, опциональный A/B-тест темы.
4. **Расписание:** сейчас / запланировать на дату-время. Confirm с количеством писем.

При нажатии «Отправить» — `POST /api/admin/marketing/campaigns/[id]/send`:
1. Создаются `EmailDeliveryJob` записи (одна на каждого получателя) в Postgres с `status=pending`, `nextAttemptAt=now`.
2. `EmailCampaign.status` → `sending`, `startedAt=now`.
3. Возвращается счётчик (N писем поставлено в очередь).
4. Cron-sidecar в ближайшие 10 сек начинает обрабатывать батчи.

### 6.4. Карточка контакта

В существующий [app/admin/users/[id]/page.tsx](app/admin/users) добавляется вкладка **«Email»** — отдельный таб с историей `EmailEvent` конкретного пользователя.

---

## 7. План разработки по спринтам

> Оценка в рабочих днях для одного fullstack-разработчика. Последовательный план.

### Спринт 0 — Фундамент (2–3 дня)

- [ ] Prisma миграция: расширения `User`, `BroadcastRecipient`, новые модели (`EmailCampaign`, `EmailVisualTemplate`, `EmailSegment`, `EmailDeliveryJob`, `EmailEvent`, `EmailAutomation`, `EmailAutomationRun`, `EmailContactImport`). Все uuid + snake_case maps.
- [ ] `lib/email/providers/types.ts` — interface
- [ ] `lib/email/providers/yandex-smtp.ts` — обёртка над текущим `email-service.ts`
- [ ] `lib/email/providers/unisender.ts` — заготовка с TODO-методами, корректно отвечающая `"not configured"`
- [ ] `lib/email/providers/factory.ts` + env `EMAIL_MARKETING_PROVIDER`
- [ ] `lib/email/security/constant-time-compare.ts` — вынесенная утилита
- [ ] `app/api/email-cron/tick/route.ts` — skeleton с auth, dispatcher вызывает `processDueDeliveryJobs()` (пока пустую) и `processDueAutomationRuns()` (пока пустую)
- [ ] Добавление публичных роутов в `middleware.ts` whitelist

### Спринт 1 — Контакты (4–5 дней)

- [ ] `/admin/marketing/contacts` — таблица всех users с email, поиск, фильтры (роль/тариф/трек/тег/статус подписки), пагинация
- [ ] `/admin/marketing/contacts/[id]` — карточка контакта с историей `EmailEvent`
- [ ] `/admin/marketing/contacts/import` — CSV upload, маппинг колонок (Email/Name/Tags/custom), валидация, дедуп, отчёт об ошибках
- [ ] `/api/admin/marketing/contacts/export` — CSV экспорт по сегменту
- [ ] Вкладка «Email» на `/admin/users/[id]`
- [ ] Расширение нового пункта `Megaphone → /admin/marketing` в `admin-layout.tsx`

### Спринт 2 — Сегменты (3–4 дня)

- [ ] Конструктор фильтров на UI: роль/тариф/трек/группа/enrolled в курсе/% прохождения уроков/неактивен N дней/тег/keyword
- [ ] AND-логика для критериев (OR-группы — позже)
- [ ] Live preview размера сегмента + sample первых 10
- [ ] Сохранение, редактирование, дублирование
- [ ] `lib/email/segments/compile-filters.ts` — JSON-фильтры → Prisma where

### Спринт 3 — Шаблоны и блочный редактор (5–7 дней)

- [ ] TipTap-конфигурация с кастомными node-ами: `heading`, `text`, `button`, `image`, `divider`, `spacer`, `columns`, `social`, `footer`
- [ ] Sidebar `BlockPalette.tsx` с draggable блоками
- [ ] `Canvas.tsx` — редактируемая область с TipTap
- [ ] `PropertiesPanel.tsx` — настройки выбранного блока
- [ ] `PreviewPane.tsx` — desktop/mobile/dark в iframe
- [ ] `lib/email/compiler/blocks-to-html.ts` — JSON → email-safe HTML
- [ ] `lib/email/compiler/variables.ts` — `{{firstName}}`, `{{course.title}}`, `{{unsubscribeUrl}}`, `{{viewInBrowserUrl}}`
- [ ] Сохранение в `EmailVisualTemplate.blocks` (JSON) и `compiledHtml`
- [ ] Галерея шаблонов с thumbnail
- [ ] Кнопка «отправить тестовое письмо» через YandexSmtpProvider

### Спринт 4 — Кампании + очередь (4–5 дней)

- [ ] `/admin/marketing/campaigns` — список с фильтрами по статусу, сортировка по OR/CTR
- [ ] Wizard `new`: 4 шага (Recipients → Content → Settings → Schedule)
- [ ] A/B-тест темы (20%/20%/60%) — победитель по OR через N часов
- [ ] **`lib/email/queue/enqueue-campaign.ts`** — создаёт `EmailDeliveryJob` пачкой по сегменту
- [ ] **`lib/email/queue/process-campaigns.ts`** — `processDueDeliveryJobs()`: take(100) из БД, отправка через провайдер, обновление статусов, exponential backoff retry
- [ ] **`lib/email/queue/retry-policy.ts`** — +30s, +5m, +30m, +2h
- [ ] **`scheduler` внутри tick** — кампании со status=`scheduled` и `scheduledAt <= now` переводятся в `sending` + enqueue
- [ ] Пауза/возобновление/отмена (UPDATE status в БД, воркер пропускает paused)
- [ ] Прогресс-бар через polling каждые 3 сек (`stats` из `EmailCampaign`)
- [ ] `/admin/marketing/campaigns/[id]` — воронка, топ кликов, таблица получателей
- [ ] **Добавление нового sidecar `email-cron` в docker-compose.prod.yml** (curl каждые 10 сек на `/api/email-cron/tick`)

### Спринт 5 — Tracking и аналитика (4–5 дней)

- [ ] `app/api/email/track/open/[recipientId]/route.ts` — отдача 1×1 GIF + асинхронная запись `EmailEvent`
- [ ] `app/api/email/track/click/[recipientId]/route.ts` — запись + 302 redirect
- [ ] `app/api/email/unsubscribe/[token]/route.ts` GET (страница) + POST (подтверждение) → `User.marketingOptOut=true`, `unsubscribedAt=now`, `provider.unsubscribeContact()`
- [ ] `app/email/unsubscribe/[token]/page.tsx` — публичная страница (одностраничная форма с одной кнопкой)
- [ ] `app/api/email/webhook/[provider]/route.ts` — HMAC проверка, парсинг через `provider.parseWebhookEvent()`, запись `EmailEvent` (с `providerEventId` для дедупа), обновление `BroadcastRecipient`/`EmailDeliveryJob`
- [ ] Dashboard `/admin/marketing` — метрики 30 дней: отправлено, доставлено, OR, CTR, отписалось, в тарифе осталось
- [ ] Графики OR/CTR по неделям (Recharts уже в проекте)
- [ ] **Suppression list**: при hard-bounce → `User.marketingOptOut = true`, исключение из будущих кампаний на этапе `enqueue-campaign.ts`

### Спринт 6 — Автоматизации (3–4 дня)

- [ ] `/admin/marketing/automations` — список цепочек со статусом и метриками
- [ ] `/admin/marketing/automations/[id]/edit` — редактор шагов (триггер → задержка → шаблон → ветвление по условию)
- [ ] Триггеры: `user_registered`, `course_purchased`, `inactive_30d`, `course_completed`, `birthday`
- [ ] `lib/email/automations/trigger-router.ts` — listener на события (расширение существующих хуков в `lib/audit.ts`)
- [ ] **`lib/email/queue/process-automations.ts`** — берёт `EmailAutomationRun` где `nextStepAt <= now`, выполняет шаг (enqueue delivery job или продвигает counter)
- [ ] Дефолтные пресеты: Welcome 3 письма, реактивация 30/45/60 дней

### Спринт 7 — Polish + опциональная миграция (2–3 дня)

- [ ] Скрипт `scripts/migrate-broadcasts-to-campaigns.ts` — конвертация существующих `Broadcast` в `EmailCampaign` (опционально, по решению Евгения)
- [ ] E2E тест: создать сегмент → шаблон → кампанию → отправить через YandexSmtpProvider на тестовую группу из 5 сотрудников → проверить открытия и клики
- [ ] Документация в `/admin/marketing/settings` — инструкция по переключению на Unisender (env, DNS, webhook URL)
- [ ] Унификация sidebar: либо превращение старых `/admin/broadcasts` и `/admin/email-templates` в редиректы внутрь `/admin/marketing/`, либо явное разделение (транзакционка vs маркетинг)

**Итого: 27–32 рабочих дня (≈ 6 недель) полный scope.**

---

## 8. Переменные окружения

```
# Существующие SMTP_* остаются для транзакционок (Yandex 360)

# Новые
EMAIL_MARKETING_PROVIDER=yandex                # yandex | unisender
EMAIL_MARKETING_FROM_NAME=Прорыв
EMAIL_MARKETING_FROM_EMAIL=mail@prrv.tech       # реальный — после регистрации поддомена
EMAIL_TRACKING_BASE_URL=https://prrv.tech       # для tracking pixel/click

EMAIL_CRON_SECRET=                              # Bearer для /api/email-cron/tick, генерится случайно

# Когда провайдер = unisender (Евгений впишет после возвращения)
UNISENDER_API_KEY=
UNISENDER_API_URL=https://api.unisender.com/ru/api
UNISENDER_WEBHOOK_SECRET=
UNISENDER_DEFAULT_LIST_ID=

# Redis для heartbeat — уже сконфигурирован
# REDIS_URL=redis://...
```

---

## 9. Docker / docker-compose изменения

Добавление в `docker-compose.prod.yml` нового sidecar (рядом с `tg-cron` и `reviews-cron`):

```yaml
email-cron:
  image: curlimages/curl:8.10.1
  container_name: proryv_email_cron
  restart: always
  depends_on:
    nginx:
      condition: service_started
  environment:
    EMAIL_CRON_SECRET: ${EMAIL_CRON_SECRET}
  entrypoint:
    - sh
    - -c
    - |
      echo "[email-cron] starting, tick every 10s";
      while true; do
        curl -fsS -X POST \
          -H "Authorization: Bearer $$EMAIL_CRON_SECRET" \
          http://nginx/api/email-cron/tick \
          -o /tmp/tick.log 2>/dev/null \
          && cat /tmp/tick.log \
          || echo "[email-cron] tick failed";
        echo;
        sleep 10;
      done
  networks:
    - proryv_network
  logging:
    driver: "json-file"
    options:
      max-size: "1m"
      max-file: "3"
```

Cadence 10 секунд (vs 20 у `tg-cron`) — потому что для рассылок latency важнее: при кампании в 70К писем разница в 10 секунд между батчами заметна.

---

## 10. Безопасность

- **HMAC-проверка webhook:** `provider.verifyWebhookSignature()` обязателен перед обработкой. Реализация переиспользует `constant-time-compare.ts`.
- **Идемпотентность:** webhook events приходят с `providerEventId`, дедуплицируем уникальным индексом на `EmailEvent.providerEventId`.
- **HTML-санитизация:** в визуальном редакторе — фиксированные node-ы TipTap, контролируемый output. В тексте/HTML внутри блоков — `sanitize-html` на сервере перед сохранением `compiledHtml` (как уже делается в `email-service.ts`).
- **Unsubscribe токен:** длинный random (`crypto.randomBytes(32).toString("base64url")`), хранится в `User.unsubscribeToken`. Переиспользуемый (юзер может подписаться/отписаться много раз). Ротация при подписке заново.
- **Rate limit:** на public endpoints (`/api/email/track/*`, `/api/email/unsubscribe/*`) — переиспользуем `lib/rate-limit.ts`.
- **Tracking pixel privacy:** не пишем raw IP, только `ipHash = sha256(ip + salt)`.
- **Транзакционка изолирована:** новый код **НЕ трогает** `lib/email-service.ts` и `lib/email-template-service.ts`. Любая ошибка в маркетинговом модуле не влияет на письма про ДЗ, оплаты, сертификаты.
- **Cron secret:** `EMAIL_CRON_SECRET` валидируется через `timingSafeEqual` (как `TG_CRON_SECRET`).

---

## 11. Открытые вопросы (для уточнения позже)

1. **Поддомен для маркетинга:** `mail.prrv.tech` рекомендован для изоляции репутации; апекс `prrv.tech` рискованно. Финальное решение — за Евгением.
2. **Имя в `From`:** `Прорыв`, `Прорыв Школа`, `marketing@prrv.tech`? Маркетинговый вопрос.
3. **Дефолтный шаблон:** будет ли мастер-шаблон заказан у Unisender (80К ₽ из КП), или сами сверстаем минимальный? Технически нам нужен хотя бы один работающий — добавим placeholder в Спринте 3.
4. **Хранение картинок писем:** Cloudflare R2 уже подключён, используем его (новый бакет `email-assets` или существующий с префиксом).

---

## 12. Что делается ВНЕ этого спека (зона ответственности Евгения)

- Заключение договора с Unisender
- Заказ услуги «Аутентификация домена» (10К ₽)
- Внесение SPF/DKIM/DMARC в DNS
- Заказ валидации базы (~13К ₽)
- Заказ услуги «Прогрев домена» (20–50К ₽) — 2–8 недель операционки
- Заказ услуги «Прогревочное письмо» (25К ₽)
- Опционально: мастер-шаблон (80К ₽), пакет регулярных рассылок (200К ₽)
- Подписка на тариф Standard 75К (26К/мес или 218К/год)
- Контентная стратегия и копирайтинг регулярных рассылок

После всего этого Евгению нужно только:
1. Прописать `UNISENDER_API_KEY`, `UNISENDER_WEBHOOK_SECRET`, `UNISENDER_DEFAULT_LIST_ID`, `EMAIL_MARKETING_FROM_EMAIL` в `.env`.
2. Сменить `EMAIL_MARKETING_PROVIDER=unisender`.
3. Указать webhook URL в кабинете Unisender: `https://prrv.tech/api/email/webhook/unisender`.
4. Запустить первую кампанию из `/admin/marketing/campaigns/new`.

---

## 13. Фактическое состояние после Спринтов 0–7

> Этот раздел добавлен **после** реализации. Если фактическое поведение
> расходится со спецификацией выше — приоритет имеет этот раздел.

### Что фактически работает в коде

| Спринт | Файлы | Статус |
|---|---|---|
| 0 | `prisma/schema.prisma` + `prisma/migrations/20260626000000_add_marketing_email_system/`, `lib/email/providers/`, `lib/email/security/`, `app/api/email-cron/tick/`, `middleware.ts` whitelist | ✅ |
| 1 | `app/admin/marketing/contacts/*`, `/api/admin/marketing/contacts/*`, вкладка Email в `/admin/users/[id]` | ✅ |
| 2 | `lib/email/segments/compile-filters.ts`, `/admin/marketing/segments/*`, `/api/admin/marketing/segments/*` | ✅ |
| 3 | `lib/email/editor/`, `lib/email/compiler/`, `/admin/marketing/templates/*`, блочный редактор | ✅ (без TipTap — простой блочный массив) |
| 4 | `lib/email/queue/`, `/admin/marketing/campaigns/*`, sidecar `email-cron` в `docker-compose.prod.yml` | ✅ |
| 5 | `app/api/email/track/*`, `app/api/email/unsubscribe/*`, `app/api/email/webhook/[provider]/`, `app/email/unsubscribe/[token]/`, расширенный dashboard | ✅ |
| 6 | `lib/email/automations/`, `lib/email/queue/process-automations.ts`, `/admin/marketing/automations/*`, `fireTrigger` в register и activate-order | ✅ |
| 7 | `/admin/marketing/settings`, `/admin/marketing/suppression`, обновлённый sidebar и docs | ✅ |

### Архитектурные решения, отличающиеся от первоначального плана

**Блочный редактор писем — не TipTap, а собственный массив блоков**
Спецификация описывала TipTap с кастомными node-ами. На практике для блоков с
настройками (URL, color, src) NodeView-машинерия ProseMirror — overkill. Документ
хранится как `EmailDocument { settings, blocks: EmailBlock[] }`, каждый блок —
discriminated union, редактируется через Properties Panel справа. TipTap всё
ещё в проекте (есть в `package.json`), но для маркетинговых писем не используется.
Файлы: `lib/email/editor/types.ts`, `app/admin/marketing/templates/_components/`.

**Автоматизации шлют напрямую, не через EmailDeliveryJob**
Спецификация описывала единый воркер через очередь. На практике автоматизация
по триггеру отправляет одиночное письмо через `provider.sendOne()` прямо из
`processDueAutomationRuns`. Это убрало необходимость в «парковочных» EmailCampaign
для цепочек. Минусы: нет автоматического retry-with-backoff на отправке шага
(если SMTP упал — шаг помечается failed). Если потребуется retry — добавить
в Спринте 8 (post-launch polish).

**Inactivity-триггер с Redis-замком**
Чтобы `processInactivityTriggers()` не запускался каждые 10 секунд (тяжёлая
выборка), используется Redis SET NX EX с TTL 1 час. Без Redis (локалка)
функция работает на каждом тике — это OK для dev.

### Что НЕ делается автоматически и требует ручных действий

| Действие | Когда | Кто |
|---|---|---|
| Внести DNS-записи SPF/DKIM/DMARC | Один раз перед запуском Unisender | DevOps по подсказке Unisender |
| Прописать env-переменные UNISENDER_* | Один раз перед переключением | Евгений |
| Перезапустить app после смены `EMAIL_MARKETING_PROVIDER` | После смены env | DevOps |
| Заказать прогрев домена в Unisender | Один раз, длится 2–8 недель | Евгений |
| Запустить первую кампанию на тестовый сегмент 5–10 сотрудников | Перед первой массовой рассылкой | Евгений |
| Решить про миграцию старых Broadcast в EmailCampaign | По желанию | Евгений (опционально, скрипт не написан) |
| Решить про сокрытие старого `/admin/broadcasts` и `/admin/email-templates` | После принятия маркетингом нового UI | Евгений |

### Куда идти за чем

- **«Как переключиться на Unisender?»** → `/admin/marketing/settings` (готовые шаги, webhook URL для копирования)
- **«Кто отписан и почему?»** → `/admin/marketing/suppression`
- **«Какие метрики у последних рассылок?»** → `/admin/marketing` (главная)
- **«Как создать рассылку?»** → `/admin/marketing/campaigns/new` (4-шаговый wizard)
- **«Как настроить welcome-серию?»** → `/admin/marketing/automations/new`
- **«Видеть email-историю конкретного юзера?»** → карточка пользователя `/admin/users/[id]` → вкладка Email, или `/admin/marketing/contacts/[id]`

### Известные ограничения и долги

1. **A/B тесты темы** — поле в схеме есть (`EmailCampaign.abTest`), UI и логика автоматического выбора winner'а не реализованы. Маркетолог может вручную создать 2 кампании с разными темами на разные сегменты.
2. **Тепловая карта кликов** — есть данные (`EmailEvent.url`), но визуализация (heatmap по шаблону) не реализована.
3. **Шаблоны автоматизации не имеют preview-теста** — в редакторе цепочки нельзя нажать «отправить тест шага N». Workaround: тестировать каждый шаблон через `/admin/marketing/templates/[id]/edit` → «Тест на мой email».
4. **Migration script Broadcast → EmailCampaign** — не написан, согласовать с Евгением нужно ли это (Broadcast и Marketing для разных целей).
5. **Метрики per-automation** — `EmailAutomation.stats` хранит только `stepsSent` и `completedRuns`. OR/CTR для цепочек не агрегируются отдельно.
