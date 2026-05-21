// Cron heartbeat — мы пишем timestamp каждого тика крон-эндпоинта,
// чтобы админка могла увидеть «эй, крон не пингует уже 10 минут».
//
// Зачем не таблица в БД: при каждом тике писать в Postgres — дороже и
// шумнее, чем Redis SET с TTL. Однако если Redis недоступен, fallback
// в БД спасает — пишем в TgEvent с типом cron.heartbeat (1 запись на
// тик уже норма для аудита).

import { getRedisClient } from "../redis";
import { db } from "../db";

const REDIS_KEY = "tg:cron:last_tick";
// Если за это время не было тика — считаем крон неживым.
// Внешний cron должен бить раз в 15–30с, поэтому 5 минут — щедрый
// порог: можно пропустить пару пингов из-за деплоя/сети.
export const CRON_STALE_THRESHOLD_MS = 5 * 60 * 1000;

interface HeartbeatRecord {
  at: number; // epoch ms
  runs: number;
  broadcasts: number;
  scheduledFlows: number;
  durationMs: number;
}

export async function writeCronHeartbeat(record: HeartbeatRecord): Promise<void> {
  const payload = JSON.stringify(record);
  // Redis path — основной.
  try {
    const client = await getRedisClient();
    // TTL = 1 час: если крон сдох совсем, ключ исчезнет и admin поймёт
    // «вообще никогда не приходил» (отличается от «давно не приходил»).
    await client.set(REDIS_KEY, payload, { EX: 3600 });
    return;
  } catch {
    // Redis недоступен — fallback в TgEvent. Идём дальше.
  }
  try {
    await db.tgEvent.create({
      data: {
        botId: null,
        subscriberId: null,
        type: "cron.heartbeat",
        properties: record as unknown as object,
      },
    });
  } catch {
    // если и БД-fallback падает — просто молчим, аварии и так будут видны
  }
}

export interface CronStatus {
  alive: boolean;
  lastTickAt: string | null;
  ageMs: number | null;
  lastTick: HeartbeatRecord | null;
  staleThresholdMs: number;
  source: "redis" | "db" | "none";
}

export async function readCronStatus(): Promise<CronStatus> {
  // 1) Сперва Redis (свежий источник)
  try {
    const client = await getRedisClient();
    const raw = await client.get(REDIS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as HeartbeatRecord;
      const age = Date.now() - parsed.at;
      return {
        alive: age < CRON_STALE_THRESHOLD_MS,
        lastTickAt: new Date(parsed.at).toISOString(),
        ageMs: age,
        lastTick: parsed,
        staleThresholdMs: CRON_STALE_THRESHOLD_MS,
        source: "redis",
      };
    }
  } catch {
    // продолжаем — попробуем БД
  }
  // 2) Fallback: последний TgEvent type=cron.heartbeat
  try {
    const ev = await db.tgEvent.findFirst({
      where: { type: "cron.heartbeat" },
      orderBy: { occurredAt: "desc" },
      select: { occurredAt: true, properties: true },
    });
    if (ev) {
      const at = ev.occurredAt.getTime();
      const age = Date.now() - at;
      const props = (ev.properties ?? null) as HeartbeatRecord | null;
      return {
        alive: age < CRON_STALE_THRESHOLD_MS,
        lastTickAt: ev.occurredAt.toISOString(),
        ageMs: age,
        lastTick: props,
        staleThresholdMs: CRON_STALE_THRESHOLD_MS,
        source: "db",
      };
    }
  } catch {
    // ignore
  }
  return {
    alive: false,
    lastTickAt: null,
    ageMs: null,
    lastTick: null,
    staleThresholdMs: CRON_STALE_THRESHOLD_MS,
    source: "none",
  };
}
