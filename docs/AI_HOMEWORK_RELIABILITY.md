# Надёжность AI-проверки ДЗ

Гайд по тому что сделано в коде для надёжности, и что нужно докрутить на инфраструктуре чтобы свести ошибки к нулю.

## Архитектура отказоустойчивости

```
        Куратор нажимает «Проверка от Джарвикса»
                       │
                       ▼
            ┌──────────────────┐
            │  AI-checker (внешний) — основной путь
            │  ngrok / VPS / Cloudflare Tunnel
            └────────┬─────────┘
                     │ timeout 15с / 5xx / network
                     ▼
            ┌──────────────────┐
            │  Claude API (Anthropic SDK) — встроенный fallback
            │  Прямо из LMS, не зависит от внешнего сервиса
            └────────┬─────────┘
                     │ rate limit / overload / no api key
                     ▼
            ┌──────────────────┐
            │  HomeworkAIQueue — отложенная очередь
            │  Cron retry с экспоненциальным backoff:
            │  1м → 2м → 5м → 15м → 30м → 1ч → 2ч → 4ч → 8ч → 24ч
            └──────────────────┘
                     │ exhausted (10 попыток)
                     ▼
            aiAnalysisError → видно в UI, куратор отвечает вручную
```

## Включение Claude fallback

Получи API-ключ в [console.anthropic.com](https://console.anthropic.com) → пропиши в `.env`:

```bash
ANTHROPIC_API_KEY=sk-ant-api03-...
CLAUDE_MODEL=claude-sonnet-4-5    # опционально, default sonnet
```

После рестарта LMS будет автоматически переключаться на Claude при любом failure AI-checker'а. Без этого ключа — fallback не работает, остаётся только cron retry.

## Что закрыто в коде

| Уровень | Что | Где |
|---|---|---|
| **Kickoff timeout** | Если AI-checker молчит за 15с — сразу пробуем Claude | `app/api/curator/homework/[id]/ai-analyze/route.ts` |
| **Cron retry** | При недоступности AI-checker → Claude → если оба упали, в очередь с backoff | `app/api/tg-cron/homework-queue/route.ts` (`runSuggestMode` + `tryClaudeFallback`) |
| **Backoff** | 1м → 2м → 5м → 15м → 30м → 1ч → 2ч → 4ч → 8ч → 24ч (10 попыток покрывают ~50ч) | `nextRetryDelayMs()` |
| **Cleanup** | Через 1ч без callback пишем `aiAnalysisError`, куратор разблокирован | `app/api/tg-cron/homework-cleanup/route.ts` |
| **Идемпотентность** | C1-C4: повторный kickoff/callback не перезаписывает результат | предыдущий аудит |

## Что нужно сделать вручную (инфраструктура)

### 1. Стабильный домен для AI-checker (P0)

Сейчас AI-checker на другом ПК через ngrok-free. Это **главная** причина сбоев — туннель регулярно падает.

Варианты:

**Cloudflare Tunnel (рекомендую)** — бесплатно, не падает:
```bash
# На ПК с AI-checker'ом:
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
chmod +x cloudflared
sudo mv cloudflared /usr/local/bin/

# Залогиниться (откроет браузер):
cloudflared tunnel login

# Создать туннель:
cloudflared tunnel create ai-checker

# В Cloudflare DNS добавить CNAME запись:
#   ai-checker.прrrv.tech → <tunnel-id>.cfargotunnel.com

# Запустить:
cloudflared tunnel --url http://localhost:5000 run ai-checker
```

Потом в LMS `.env`:
```bash
AI_CHECKER_URL=https://ai-checker.prrv.tech
```

**Альтернатива:** перенести AI-checker на тот же VPS что LMS — внутренняя docker-сеть `http://ai-checker:5000`, никакого внешнего домена не нужно.

### 2. Auto-restart AI-checker

В Docker:
```yaml
services:
  ai-checker:
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

Или systemd-юнит если без Docker.

### 3. Cron'ы в планировщике

Все три должны быть настроены:

```cron
* * * * *      POST https://prrv.tech/api/tg-cron/homework-queue
               Header: x-cron-secret: $TG_CRON_SECRET

*/10 * * * *   POST https://prrv.tech/api/tg-cron/homework-cleanup
               Header: x-cron-secret: $TG_CRON_SECRET

*/15 * * * *   POST https://prrv.tech/api/tg-cron/messaging-tick
               Header: x-cron-secret: $TG_CRON_SECRET
```

### 4. Uptime-мониторинг AI-checker

UptimeRobot (бесплатно) → пинг `https://ai-checker.prrv.tech/health` каждые 5 минут → SMS/email при downtime.

## Ожидаемые показатели после внедрения

| Метрика | До | После Уровня 1+2+3 |
|---|---|---|
| Success rate AI-проверки | ~85-95% | ~99.9% |
| Время до результата (нормал) | 1-5 мин | 1-5 мин |
| Время до результата (AI-checker лёг) | **никогда** (зависает) | **<1 минуты** (Claude fallback) |
| MTTR при outage AI-checker | ~часы (ручной фикс) | ~0 (Claude работает) |

## Что ещё можно добавить (Уровень 4-5)

- **Multi-provider**: GPT-4 как третий backup для случая когда и Anthropic лёг (редко, но бывает)
- **Алерт админу в TG** когда AI-checker не отвечает > 3 раз за 10 минут
- **Dashboard success rate**: график success/fail по дням в `/admin/monitoring/ai-homework`
