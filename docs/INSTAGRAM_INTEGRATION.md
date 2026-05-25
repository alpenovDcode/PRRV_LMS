# Instagram Integration — Setup Guide

Краткий гайд по подключению Instagram-канала к LMS. Реализована OAuth-схема в стиле SaleBot: пользователь логинится через свой Instagram Business-аккаунт, токен сохраняется на нашей стороне (шифрованным), webhook принимает входящие сообщения.

## 1. Шаги в Meta for Developers (one-time)

### 1.1. Создать приложение

1. Зайти на [developers.facebook.com](https://developers.facebook.com/) → My Apps → Create App
2. Тип приложения: **Business**
3. Заполнить название и контактный email

### 1.2. Добавить продукт «Instagram»

В разделе Products найти **Instagram** → **Add Product**. Выбрать вариант **«API with Instagram Login»** (новый, без обязательной FB Page).

### 1.3. Настроить OAuth Redirect URI

В настройках Instagram продукта:

```
https://prrv.tech/api/messaging/instagram/oauth/callback
```

Если работаешь локально, можно временно добавить ngrok URL.

### 1.4. Получить App ID и App Secret

В **App Settings → Basic** будут:
- **App ID** — публичный, идёт в env как `IG_APP_ID`
- **App Secret** — приватный, идёт в env как `IG_APP_SECRET`

### 1.5. Настроить webhook

В разделе **Webhooks → Instagram**:

- **Callback URL**: `https://prrv.tech/api/messaging/webhook/instagram`
- **Verify Token**: придумай рандомную строку (например, `openssl rand -hex 32`) — она же пойдёт в env как `IG_WEBHOOK_VERIFY_TOKEN`
- Подпишись на поля: `messages`, `messaging_postbacks`

Meta пришлёт GET-запрос на callback URL для проверки токена — если `IG_WEBHOOK_VERIFY_TOKEN` в env совпадает с тем что введён в Meta, верификация пройдёт.

### 1.6. App Review (для прод-использования)

Пока приложение в **Development Mode**, работают только аккаунты добавленные как **Roles → Tester** в Meta Dev Console.

Для публичного использования нужен **App Review**:
1. Подготовить:
   - Privacy Policy URL (`https://prrv.tech/privacy`)
   - Terms of Service URL (`https://prrv.tech/terms`)
   - Скриншоты UI кнопки «Подключить Instagram»
   - Видео-демонстрация flow (~1-2 минуты)
   - Описание use case (зачем нужны permissions)
2. Запросить permissions:
   - `instagram_business_basic`
   - `instagram_business_manage_messages`
3. Submit → ждать 1-4 недели

## 2. Env-переменные LMS

Добавить в `.env`:

```bash
IG_APP_ID=<из Meta App>
IG_APP_SECRET=<из Meta App>
IG_OAUTH_REDIRECT_URI=https://prrv.tech/api/messaging/instagram/oauth/callback
IG_WEBHOOK_VERIFY_TOKEN=<тот же что введён в Meta Webhooks>
```

`MESSAGING_TOKEN_ENC_KEY` не нужен — переиспользуется существующий `TG_TOKEN_ENC_KEY`.

## 3. Что должен сделать пользователь LMS

При подключении аккаунта через UI:

1. **Перевести аккаунт в Business**:
   - Открыть Instagram → Профиль → Изменить
   - «Переключиться на профессиональный аккаунт» → выбрать **Business**

2. **Разрешить API доступ к сообщениям**:
   - Instagram → Настройки → Конфиденциальность → Сообщения
   - Включить «Разрешить доступ к сообщениям»

3. В LMS → **Каналы (Instagram/МАКС)** → **Подключить Instagram**
4. Авторизоваться через Instagram, дать permissions
5. Готово — аккаунт виден в списке подключённых

## 4. Cron — refresh long-lived токенов

Long-lived токены Meta живут 60 дней. Нужно периодически продлевать:

```
POST /api/tg-cron/refresh-ig-tokens
Header: x-cron-secret: <TG_CRON_SECRET>
```

Запускать **раз в день** (или раз в неделю). Cron обновит токены, истекающие в ближайшие 7 дней, и заодно очистит просроченные OAuth-state записи.

В Vercel Cron / external scheduler добавить:

```cron
0 3 * * *  → POST https://prrv.tech/api/tg-cron/refresh-ig-tokens
```

## 5. Технические эндпоинты

| Метод | URL | Назначение |
|---|---|---|
| GET | `/api/messaging/instagram/oauth/start` | Возвращает URL для редиректа на OAuth |
| GET | `/api/messaging/instagram/oauth/callback` | Callback от Meta после авторизации |
| GET | `/api/messaging/webhook/instagram` | Verify-handshake для Meta |
| POST | `/api/messaging/webhook/instagram` | Приём входящих сообщений |
| GET | `/api/admin/messaging/bots` | Список подключённых аккаунтов |
| DELETE | `/api/admin/messaging/bots/[id]` | Отключение |
| POST | `/api/tg-cron/refresh-ig-tokens` | Cron refresh |

## 6. Ограничения Instagram

- **24-hour messaging window**: за пределами 24ч после последнего входящего нельзя слать без `message_tag` (`HUMAN_AGENT`, `POST_PURCHASE_UPDATE`, `ACCOUNT_UPDATE`)
- **Quick Replies**: до 13 кнопок, текст ≤ 20 символов
- **Только Business / Creator** аккаунты — Personal не поддерживается
- **Inline-кнопок нет** — flow-движок должен конвертировать кнопки в quick replies

## 7. Дальнейшие шаги

Текущий MVP покрывает:
- ✅ OAuth подключение
- ✅ Webhook + verify
- ✅ Отправка text / quick replies через Graph API
- ✅ Refresh long-lived токенов
- ✅ UI подключения / отключения

TODO для полной интеграции (Phase 1 рефакторинг + provider abstraction):
- [ ] `MessagingProvider` интерфейс, IG как реализация
- [ ] Маршрутизация входящих в flow-движок (как у Telegram)
- [ ] Broadcasts / рассылки по сегменту
- [ ] Bitrix24 sync для IG-подписчиков
- [ ] UI: статистика, переменные подписчика, чат-инспектор
