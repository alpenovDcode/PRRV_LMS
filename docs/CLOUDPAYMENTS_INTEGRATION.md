# CloudPayments Integration — Setup Guide

Интеграция через **JS-виджет** CloudPayments. Один виджет покрывает все методы оплаты: карты РФ и иностранные, СБП, Долями, рассрочка Т-Банк, TinkoffPay/SberPay/MirPay.

## 1. Настройка кабинета CloudPayments

### 1.1. Получить реквизиты API

В личном кабинете CP → **Настройки → Сайты → Реквизиты для API**:

- **Public ID** — публичный, идёт на фронт (`CP_PUBLIC_ID`)
- **API Secret** — приватный, только сервер (`CP_API_SECRET`)
  - Используется и для HTTP Basic Auth при server-to-server вызовах
  - И как HMAC-ключ для верификации webhook'ов

### 1.2. Настроить webhook

В личном кабинете CP → **Настройки → Уведомления**.

| Событие | URL | Метод |
|---|---|---|
| Check (проверка)   | `https://prrv.tech/api/payments/webhook?event=Check`   | POST |
| Pay (успех)        | `https://prrv.tech/api/payments/webhook?event=Pay`     | POST |
| Fail (отказ)       | `https://prrv.tech/api/payments/webhook?event=Fail`    | POST |
| Confirm (для Dual) | `https://prrv.tech/api/payments/webhook?event=Confirm` | POST |
| Refund (возврат)   | `https://prrv.tech/api/payments/webhook?event=Refund`  | POST |

Можно использовать **один URL для всех событий** (без `?event=`) — наш handler определяет тип по полям payload'а. Но query-параметр надёжнее.

### 1.3. Подключить методы оплаты

В кабинете CP отдельно подключаются:

- ✅ **Карты РФ и Pay-сервисы** — включено по умолчанию
- ✅ **Карты не РФ (ForeignCard)** — обычно по запросу к менеджеру
- ✅ **СБП** — нужно подключить и пройти модерацию
- ✅ **Долями** — отдельный договор + интеграция через CP
- ✅ **Рассрочка Т-Банк (TcsInstallment)** — отдельная заявка
- ✅ **TinkoffPay / SberPay / MirPay** — подключаются с одобрения банков

## 2. Env-переменные на сервере

В `.env`:

```bash
# Активируем CP
PAYMENT_PROVIDER=cloudpayments

# Реквизиты из личного кабинета CP
CP_PUBLIC_ID=pk_xxxxxxxxxxxxxxxxxxxxxxxx
CP_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Single — одностадийная (сразу списание). Dual — холд + ручной confirm.
CP_PAYMENT_SCHEMA=Single

# Опционально: comma-separated методы, которые НУЖНО ОТКЛЮЧИТЬ в виджете.
# Возможные значения: Card, ForeignCard, Sbp, Dolyame, TcsInstallment,
#                     TinkoffPay, SberPay, MirPay
# Пусто = доступны все подключённые в кабинете.
CP_RESTRICTED_METHODS=
```

После правки `.env` нужен полный рестарт контейнера app (`./scripts/deploy.sh`).

## 3. Как работает

### Flow покупки

1. Пользователь жмёт «Оплатить» на `/checkout/[offerId]`
2. Фронт → `POST /api/payments/create { offerId }`
3. Сервер создаёт `Order` (status=pending) + получает params для виджета
4. Возвращает `{ kind: "widget", widget: "cloudpayments", params: { publicId, amount, ... } }`
5. Фронт грузит `https://widget.cloudpayments.ru/bundles/cloudpayments.js`
6. Открывает виджет с переданными params — юзер выбирает метод оплаты на форме
7. **Параллельно CP шлёт webhook'и** на наш `/api/payments/webhook`:
   - `Check` → отвечаем `{ code: 0 }` чтобы пропустить платёж
   - `Pay` → активируем заказ (выдаём Enrollment, обновляем тариф)
8. После закрытия виджета фронт редиректит на `/payments/success?orderId=...`
9. На success-странице polling статуса показывает финальный результат

### Безопасность

- **HMAC-SHA256** проверяется в `parseCpWebhook` для каждого webhook'а
- Невалидная подпись → 401, без подробностей наружу
- **Лимит тела** 64KB на webhook
- **Идемпотентность** — заказ в `paid` нельзя откатить
- **Атомарная активация** через `activateOrder` (см. fixes C3+C4)

### Что хранится в БД

В таблице `orders`:
- `ykPaymentId` — `TransactionId` от CP (после первого webhook'а)
- `ykSnapshot` — последний полученный payload от CP (для аудита)
- `paymentMethod` — метод оплаты (card:visa, sbp, dolyame, etc.)
- `status`, `paidAt` — стандартные поля

## 4. Тестирование

### Тестовая среда CP

CP предоставляет тестовые ключи (Public ID начинается с `test_api_`). В тестовой среде доступны test-карты:

| Карта | Результат |
|---|---|
| 4242 4242 4242 4242 | Успешная оплата |
| 4111 1111 1111 1112 | Требует 3DS |
| 4000 0000 0000 0002 | Отказ банка |

CVV любой 3 цифры, дата истечения — любая в будущем.

### Локальный тест webhook'а

Через ngrok пробросить локальный 3000 порт → подставить URL в CP-кабинете → совершить тестовый платёж.

## 5. Endpoints

| Метод | URL | Назначение |
|---|---|---|
| POST | `/api/payments/create` | Создать заказ + получить params виджета |
| POST | `/api/payments/webhook` | Приём webhook'ов от CP (Check/Pay/Fail/Refund) |
| GET  | `/api/payments/status/[orderId]` | Статус заказа (polling на /payments/success) |

## 6. Что не сделано (можно добавить позже)

- ⏳ **Возвраты** через UI (refunds): сейчас только webhook на Refund. Кнопка «Вернуть деньги» в админке заказов — отдельная задача.
- ⏳ **Recurring/подписки**: CP поддерживает, но в нашей схеме `Offer.tariff` пока без месячных списаний.
- ⏳ **Двухстадийная схема (Dual)** реализована на уровне provider, но нет UI для подтверждения холда. Сейчас включается через `CP_PAYMENT_SCHEMA=Dual`, но confirm придётся делать вручную через CP-API.
- ⏳ **Server-to-server `/payments/cards/charge`** (без виджета) — не нужен пока используется виджет.

## 7. Куда смотреть в коде

```
lib/payments/
  types.ts                          # CreatedPayment = redirect | widget
  index.ts                          # фабрика, ветка "cloudpayments"
  cloudpayments/
    config.ts                       # env + ассерты
    webhook.ts                      # HMAC verify + парсинг form-urlencoded
    provider.ts                     # CloudPaymentsProvider реализация

app/api/payments/
  create/route.ts                   # возвращает {kind: widget, params: ...}
  webhook/route.ts                  # универсальный handler с ackResponse

app/checkout/[offerId]/page.tsx     # грузит CP-скрипт, открывает widget.pay()
```
