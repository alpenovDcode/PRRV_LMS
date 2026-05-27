# MAX Bot интеграция

Подключение бота MAX и построение воронок поверх неё. Использует
существующий **channel-agnostic flow-engine** — те же узлы и триггеры
работают для MAX и Instagram.

## 1. Получение токена в MAX

1. Открой приложение MAX → найди **@MasterBot**
2. Команда `/newbot` → следуй инструкциям (имя + username)
3. MasterBot пришлёт **bot token** в формате длинной строки
4. Скопируй его

## 2. Подключение в LMS

1. Открой `/admin/messaging` (раздел «Каналы Instagram/МАКС» в сайдбаре)
2. Нажми **«Подключить МАКС»** (синяя плитка)
3. Вставь токен → **«Подключить»**

Что произойдёт:
- LMS вызывает `GET https://platform-api.max.ru/me` для проверки токена
- Регистрирует webhook через `POST /subscriptions` — URL `https://prrv.tech/api/messaging/webhook/max`
- Шифрует токен AES-256-GCM (тот же ключ `TG_TOKEN_ENC_KEY` что у Telegram)
- Создаёт `MessagingBot` с `channel=max`

## 3. Построение воронки

Воронки работают **точно так же** как для Instagram. Идёшь в:
`/admin/messaging/[botId]/flows` → создаёшь новую → drag-n-drop редактор.

### Особенности MAX vs Instagram

| Возможность | MAX | Instagram |
|---|---|---|
| Inline-кнопки (callback) | ✅ нативно | ❌ только quick replies |
| URL-кнопки | ✅ нативно (`link`) | ⚠️ через Button Template |
| 24h messaging window | ❌ нет | ✅ есть |
| Триггер «комментарий к посту» | ❌ | ✅ |
| Триггер «ответ на сторис» | ❌ | ✅ |
| Триггер «keyword в DM» | ✅ | ✅ |
| Quick replies (до 13 кнопок) | ✅ эмулируются | ✅ нативно |

В flow editor доступны все типы узлов:
- `send_text` — текст
- `send_quick_replies` — кнопки с payload (для MAX: callback-кнопки)
- `send_buttons` — карточные кнопки URL/postback (для MAX: link/callback)
- `wait_reply` — ожидание ответа
- `condition` — ветвление по `lastInput` или `lastPayload`
- `set_variable` — сохранение переменной
- `end`

### Шаблоны в тексте

```
{{subscriber.username}}   — username из MAX
{{subscriber.firstName}}  — имя
{{context.lastInput}}     — последний текст подписчика
{{context.lastPayload}}   — payload последней нажатой кнопки
{{bot.title}}             — название бота
{{now}}                   — текущая дата/время
```

## 4. Безопасность

- **Токен шифруется** перед записью в БД (AES-256-GCM через `TG_TOKEN_ENC_KEY`)
- **Webhook без HMAC** — MAX не подписывает запросы (в отличие от Meta).
  Защита через **малую вероятность угадывания URL** + **проверка корректности структуры payload**
- Для нескольких MAX-ботов в будущем — поддерживается `?botId=<uuid>` в URL подписки

## 5. Endpoints

| Метод | URL | Что |
|---|---|---|
| POST | `/api/admin/messaging/max/connect` | Подключить бот по токену |
| GET | `/api/admin/messaging/bots` | Список всех ботов (включая MAX) |
| DELETE | `/api/admin/messaging/bots/[id]?mode=disable\|delete` | Отключить/удалить |
| POST | `/api/messaging/webhook/max` | Webhook от MAX (внутренний) |

## 6. Архитектура

```
МАКС → POST /api/messaging/webhook/max
        ↓
   parse update_type:
     message_created  → dispatchInbound(triggerType: "keyword_dm", text)
     message_callback → dispatchInbound(payload: <callback_payload>)
        ↓
   MessagingTrigger match → MessagingFlowRun.startFlow()
        ↓
   FlowEngine выполняет узлы → MaxBotProvider.sendText/sendButtons/...
        ↓
   POST https://platform-api.max.ru/messages → клиент получает сообщение
```

## 7. Что НЕ реализовано

- ⏳ **Long polling** — поддерживается только webhook. Если webhook не работает (dev без HTTPS), нужен ngrok.
- ⏳ **Несколько MAX-ботов** — пока один на инсталляцию. Расширение тривиально (параметр `?botId=` в URL подписки).
- ⏳ **Медиа в сообщениях** — только текст. Картинки/файлы можно добавить через `attachments` в `POST /messages`.
- ⏳ **Group chats** — текущая реализация рассчитана на 1-on-1 (DM).
