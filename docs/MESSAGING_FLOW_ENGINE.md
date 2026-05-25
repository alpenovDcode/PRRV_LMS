# Channel-agnostic flow-engine — Этап 1 (фундамент)

Базовый engine для воронок поверх `MessagingBot`. Сейчас поддерживает Instagram, в будущих этапах добавятся МАКС и миграция Telegram.

## Архитектура

```
┌──────────────────┐        ┌──────────────────┐
│ Webhook (IG/MAX) │───────>│  Dispatcher      │
│  верифицирует    │        │  - resume waiting│
│  подпись         │        │  - match trigger │
└──────────────────┘        └────────┬─────────┘
                                     │
                                     v
                            ┌──────────────────┐        ┌──────────────────┐
                            │  Runner          │───────>│  BotProvider     │
                            │  - execute nodes │        │  (channel-spec)  │
                            │  - manage state  │        │  - sendText      │
                            └──────────────────┘        │  - sendQuick...  │
                                                        │  - canSendNow    │
                                                        └──────────────────┘
```

## Граф воронки

`MessagingFlow.graph` — JSON со словарём узлов:

```json
{
  "startNodeId": "n1",
  "nodes": {
    "n1": { "type": "send_text", "text": "Привет, {{subscriber.username}}!", "next": "n2" },
    "n2": { "type": "wait_reply", "timeoutSec": 86400, "onReply": "n3", "onTimeout": "n4" },
    "n3": {
      "type": "condition",
      "branches": [
        { "field": "lastInput", "match": "contains", "value": "цена", "next": "n5" },
        { "field": "lastInput", "match": "contains", "value": "купить", "next": "n5" }
      ],
      "onNoMatch": "n6"
    },
    "n5": {
      "type": "send_quick_replies",
      "text": "Какой формат тебе подходит?",
      "buttons": [
        { "title": "Самостоятельно", "payload": "SR" },
        { "title": "С куратором", "payload": "LR" }
      ],
      "next": "n7"
    },
    "n4": { "type": "send_text", "text": "Если что — пиши когда удобно.", "next": null },
    "n6": { "type": "send_text", "text": "Спасибо, мы свяжемся.", "next": null },
    "n7": { "type": "end" }
  }
}
```

### Типы узлов

| Тип | Поля | Описание |
|---|---|---|
| `send_text` | `text`, `next` | Отправить текст с поддержкой шаблонов `{{subscriber.username}}` |
| `send_quick_replies` | `text`, `buttons[]`, `next` | Quick replies — кнопки исчезают после клика. Макс 13. |
| `wait_reply` | `timeoutSec`, `onReply`, `onTimeout` | Ждать ответ. При timeout → `onTimeout` |
| `condition` | `branches[]`, `onNoMatch` | Ветвление по `lastInput` или `lastPayload` |
| `set_variable` | `key`, `value`, `next` | Записать переменную в `context` |
| `end` | — | Конец воронки |

### Шаблоны

В тексте можно использовать:
- `{{subscriber.username}}`, `{{subscriber.firstName}}`, `{{subscriber.lastName}}`
- `{{subscriber.variables.key}}` — произвольные переменные подписчика
- `{{context.foo}}` — переменные накопленные в `set_variable`
- `{{context.lastInput}}`, `{{context.lastPayload}}` — ввод после `wait_reply`
- `{{bot.title}}`
- `{{now}}` — текущая дата/время

## Триггеры

Воронка запускается **триггером**. У одной воронки может быть несколько триггеров.

| Тип | Поддержка | Описание |
|---|---|---|
| `keyword_dm` | ✅ IG (в этом этапе) | Совпадение в DM |
| `keyword_comment` | ⏳ Этап 3 | Совпадение в комментарии к посту |
| `story_reply` | ⏳ Этап 3 | Ответ на сторис |
| `mention` | ⏳ Этап 3 | Упоминание в сторис/посте |
| `subscriber_joined` | ⏳ Этап 4 | Новый подписчик |
| `manual` | ⏳ Этап 4 | Ручной запуск через API |

Match-типы: `exact`, `contains`, `starts_with`, `regex`. Case-insensitive по умолчанию.

## API эндпоинты

### Управление flows

| Метод | URL | Назначение |
|---|---|---|
| GET | `/api/admin/messaging/bots/[id]/flows` | Список воронок бота |
| POST | `/api/admin/messaging/bots/[id]/flows` | Создать |
| GET | `/api/admin/messaging/flows/[flowId]` | Детали + триггеры |
| PATCH | `/api/admin/messaging/flows/[flowId]` | Изменить (name, graph, isActive) |
| DELETE | `/api/admin/messaging/flows/[flowId]` | Удалить |

### Триггеры

| Метод | URL | Назначение |
|---|---|---|
| POST | `/api/admin/messaging/flows/[flowId]/triggers` | Добавить триггер |
| PATCH | `/api/admin/messaging/triggers/[triggerId]` | Изменить |
| DELETE | `/api/admin/messaging/triggers/[triggerId]` | Удалить |

### Cron

| URL | Назначение |
|---|---|
| `POST /api/tg-cron/messaging-tick` | Будит wait_reply runs с истёкшим timeout. Каждые 20-60с. |

Добавить в планировщик:
```cron
* * * * *  POST https://prrv.tech/api/tg-cron/messaging-tick
           Header: x-cron-secret: $TG_CRON_SECRET
```

## UI

| Путь | Что |
|---|---|
| `/admin/messaging` | Список подключённых каналов (Instagram, MAX в будущем) |
| `/admin/messaging/[botId]/flows` | Список воронок бота |
| `/admin/messaging/[botId]/flows/[flowId]` | Редактор графа (JSON) + триггеры |

Drag-n-drop конструктор графа — Этап 2.

## Что в этом этапе НЕ реализовано

- ⏳ Триггеры на комментарии, сторис, упоминания (нужны webhook events `comments`, `mentions`) — Этап 3
- ⏳ Broadcasts / массовые рассылки (с учётом 24h-window) — Этап 4
- ⏳ Drag-n-drop конструктор графа (сейчас JSON-редактор) — Этап 2
- ⏳ TelegramBotProvider — Telegram пока живёт отдельно в `TgBot` — Этап 4
- ⏳ MaxBotProvider — Этап 3
- ⏳ Bitrix-синхронизация для IG-подписчиков — Этап 3
