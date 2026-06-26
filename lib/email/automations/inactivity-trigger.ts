import { db } from "@/lib/db";
import { getRedisClient } from "@/lib/redis";
import { fireTrigger } from "./trigger-router";

/**
 * Периодический поиск пользователей, которые попадают под inactive_30d
 * (и аналогичные) триггер, и запуск автоматизаций для них.
 *
 * Запускается из /api/email-cron/tick, но не на каждом тике (раз в 10с —
 * избыточно). Используем Redis-замок с TTL = 1 час: если уже сканировали
 * меньше часа назад, тихо пропускаем.
 *
 * Логика:
 *   1. Найти все active EmailAutomation с trigger="inactive_30d".
 *      Для каждой берём triggerData.days (по умолчанию 30).
 *   2. Найти пользователей где
 *        lastActiveAt < now - days AND marketingOptOut = false AND isBlocked = false.
 *   3. Для каждого вызвать fireTrigger("inactive_30d", userId).
 *      Защита от дублей: fireTrigger сам проверяет существующий running run.
 *
 * Лимит на проход: 500 пользователей — чтобы один тик не висел.
 * Через час следующий тик подхватит остальных.
 */

const LOCK_KEY = "email:inactivity:last_run_at";
// На время выполнения держим короткий lock (10 мин). Если процесс крашится,
// ключ сам испарится через 10 мин — другой инстанс сможет попробовать.
const LOCK_RUNNING_TTL_SEC = 10 * 60;
// После УСПЕШНОГО завершения продляем lock до 1 часа — это cooldown, чтоб не
// сканировать чаще нужного.
const LOCK_COOLDOWN_TTL_SEC = 60 * 60;
const BATCH = 500;

export interface InactivityResult {
  checked: number;
  started: number;
  skipped: boolean;
}

export async function processInactivityTriggers(now: Date = new Date()): Promise<InactivityResult> {
  // Замок через Redis SET NX EX. Если не получили — значит другой воркер уже
  // работает (running) или недавно успешно отработал (cooldown).
  let lockAcquired = false;
  try {
    const redis = await getRedisClient();
    const acquired = await redis.set(LOCK_KEY, now.toISOString(), {
      NX: true,
      EX: LOCK_RUNNING_TTL_SEC,
    });
    if (!acquired) {
      return { checked: 0, started: 0, skipped: true };
    }
    lockAcquired = true;
  } catch (e) {
    console.warn("[inactivity-trigger] Redis lock failed, fallback to single-run:", e);
    // Без Redis-замка работаем как обычно — на проде Redis всегда есть.
  }

  try {
    return await runScan(now);
  } finally {
    // При успехе продляем lock до cooldown'a (1 час) — больше не запускаем.
    // При ошибке оставляем running TTL (10 мин) — другой инстанс попробует.
    if (lockAcquired) {
      try {
        const redis = await getRedisClient();
        await redis.set(LOCK_KEY, now.toISOString(), { EX: LOCK_COOLDOWN_TTL_SEC });
      } catch (e) {
        console.warn("[inactivity-trigger] Failed to extend cooldown lock:", e);
      }
    }
  }
}

async function runScan(now: Date): Promise<InactivityResult> {
  // Собираем все active inactive_30d автоматизации.
  const automations = await db.emailAutomation.findMany({
    where: { trigger: "inactive_30d", isActive: true },
    select: { triggerData: true },
  });
  if (automations.length === 0) {
    return { checked: 0, started: 0, skipped: false };
  }

  // Берём максимальный порог среди всех автоматизаций — отдельные fireTrigger
  // сами разберутся с фильтром.
  const maxDays = automations
    .map((a) => {
      const data = a.triggerData as Record<string, unknown> | null;
      return typeof data?.days === "number" ? data.days : 30;
    })
    .reduce((a, b) => Math.max(a, b), 30);

  const threshold = new Date(now.getTime() - maxDays * 24 * 60 * 60 * 1000);

  // Находим неактивных. Стримим — пагинация через cursor.
  let checked = 0;
  let started = 0;
  let cursor: string | undefined;

  for (;;) {
    const batch = await db.user.findMany({
      where: {
        lastActiveAt: { lt: threshold, not: null },
        marketingOptOut: false,
        isBlocked: false,
      },
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true },
    });
    if (batch.length === 0) break;

    checked += batch.length;
    for (const u of batch) {
      const res = await fireTrigger("inactive_30d", u.id);
      started += res.started;
    }

    cursor = batch[batch.length - 1].id;
    if (batch.length < BATCH) break;

    // Soft-лимит 5000 пользователей за один тик. Остальные подхватим на
    // следующем (через час).
    if (checked >= 5000) break;
  }

  return { checked, started, skipped: false };
}


