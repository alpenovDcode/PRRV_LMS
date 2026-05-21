# AI-checker contract (Джарвикс)

LMS ← → AI-checker протокол для проверки домашних заданий.

## Зачем async

Claude Code CLI на одно задание (особенно с картинками) тратит 2-5 минут.
ngrok-free режет любое HTTP-соединение на 2 минутах. Поэтому
синхронный POST `/api/homework/analyze` нестабилен — `client_timeout` /
`upstream_timeout` срабатывает раньше чем CLI заканчивает.

Решение: **kickoff + callback**. LMS даёт AI-checker задание и URL для
callback, AI-checker сразу подтверждает приём (202), считает в фоне,
потом POST-нёт результат на callback.

## Эндпоинты

### `POST {AI_CHECKER_URL}/api/homework/analyze` — kickoff (AI-checker реализует)

LMS вызывает этот эндпоинт когда куратор жмёт «Проверка от Джарвикса».

**Headers:**
- `Content-Type: application/json`
- `X-API-Key: <AI_CHECKER_KEY>` — аутентификация LMS перед AI-checker

**Body (JSON):**
```json
{
  "submissionId": "<uuid>",
  "callbackUrl": "https://prrv.tech/api/internal/ai-callback/<submissionId>",
  "callbackSecret": "<строка-секрет>",

  "studentAnswer": "...",
  "aiPrompt": "...",
  "aiContext": "...|null",
  "imageFiles": ["https://...", ...],
  "lessonTitle": "...",
  "lessonContent": "...|null",
  "studentName": "..."
}
```

**Ответ (рекомендованный async):**
- `202 Accepted` + body `{ "accepted": true }` (тело необязательно)
- Дальше AI-checker считает в фоне и POST-ит на `callbackUrl` (см. ниже)

**Ответ (legacy sync, всё ещё работает):**
- `200 OK` + body `{ "verdict": "approved"|"rejected", "comment": "..." }`
- LMS сохранит результат немедленно, callback не нужен

**Любой не-2xx:**
- LMS зафиксирует ошибку в `homework_submissions.ai_analysis_error` и
  покажет её куратору на UI

**Таймаут со стороны LMS:** 15 секунд. Дольше держать соединение
бессмысленно — мы ждём только ACK, не сам анализ.

### `POST {callbackUrl}` — callback (AI-checker зовёт)

Когда AI-checker закончил анализ (или провалился), он шлёт POST на
callback-URL, который LMS передал в kickoff.

**Headers:**
- `Content-Type: application/json`
- Либо `X-Callback-Secret: <callbackSecret>`
- Либо `Authorization: Bearer <callbackSecret>`

**Body (успех):**
```json
{ "verdict": "approved" | "rejected", "comment": "..." }
```
Допускается также `"approve"` / `"reject"` — LMS нормализует.

**Body (ошибка):**
```json
{ "error": "описание что пошло не так" }
```
В таком случае LMS запишет это в `aiAnalysisError` и покажет куратору.

**Ответ:**
- LMS возвращает `200 OK` + `{ "ok": true }` если всё записал
- `401 Unauthorized` если секрет не совпал
- `400 Bad Request` если verdict/comment отсутствуют

## Состояние submission в БД

В `homework_submissions` 5 полей, связанных с анализом:

| поле | смысл |
|---|---|
| `ai_analysis_started_at` | момент kickoff. Выставлен → анализ был запущен |
| `ai_analyzed_at` | момент успешного callback'а. Выставлен → готово |
| `ai_suggested_verdict` | "approved" / "rejected" |
| `ai_suggested_comment` | текст для куратора |
| `ai_analysis_error` | если callback пришёл с error, или kickoff упал |

Состояния:
- **idle:** все поля null
- **в процессе:** `started_at` выставлен, `analyzed_at` null, `error` null → фронт polling-ит
- **готово:** `analyzed_at` + `verdict` + `comment` выставлены
- **ошибка:** `started_at` выставлен, `analyzed_at` null, `error` выставлен → куратор видит ошибку, может перезапустить

## Env-переменные

В `.env` LMS:
- `AI_CHECKER_URL` — публичный URL AI-checker (например ngrok)
- `AI_CHECKER_KEY` — секрет для `X-API-Key` (LMS → AI-checker)
- `AI_CALLBACK_SECRET` — секрет для callback (AI-checker → LMS). Если
  не задан, используется `AI_CHECKER_KEY`. В проде лучше задать
  отдельный.
- `NEXT_PUBLIC_APP_URL` — публичный URL LMS (для построения
  callbackUrl). Дефолт `https://prrv.tech`.

В AI-checker:
- Должен принять `X-API-Key`-аутентификацию
- Должен уметь POST-нуть на произвольный `callbackUrl` с
  `X-Callback-Secret` или `Authorization: Bearer <secret>`

## Что нужно доделать в AI-checker

Чтобы перейти на async-режим (рекомендуется), нужно:

1. Принимать поля `submissionId`, `callbackUrl`, `callbackSecret` в
   POST-теле `/api/homework/analyze`.
2. Если эти поля переданы — сразу вернуть `202 Accepted` и запустить
   анализ в фоне (worker, queue, просто `asyncio.create_task`, что
   угодно).
3. По окончании анализа — POST на `callbackUrl` с заголовком
   `X-Callback-Secret: <callbackSecret>` и body `{verdict, comment}`
   (или `{error}`).

До этой доработки текущая sync-логика (200 + verdict+comment) тоже
работает — но только для быстрых заданий, которые укладываются в 15с
kickoff-таймаут.

## Чем хорош этот контракт

- Куратор не сидит с крутилкой 3-5 минут — UI сразу отдаёт «анализ
  запущен», можно работать с другими ДЗ
- Polling делает один HTTP-запрос раз в 10с, через nginx, не через
  ngrok → нет проблем с 2-минутным лимитом
- Если ngrok / AI-checker упадёт во время анализа — куратор увидит
  понятную ошибку (через `aiAnalysisError`), а не зависший спиннер
- Идемпотентность: если callback придёт дважды (retry), второй раз
  просто перезапишет то же значение
- Backward-compatible: legacy sync-режим продолжает работать без
  каких-либо изменений в AI-checker
