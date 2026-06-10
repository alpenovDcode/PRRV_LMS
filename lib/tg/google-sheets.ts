/**
 * lib/tg/google-sheets.ts
 *
 * Авто-экспорт подписчиков TG-бота в Google Sheets через Apps Script
 * Web App (вебхук). Параллель lib/tg/bitrix-sync.ts по архитектуре:
 * per-bot конфиг, best-effort, не валит основной flow.
 *
 * Как работает на стороне Google:
 *   Админ вставляет наш Apps Script в свою таблицу, деплоит как Web App
 *   («Кто угодно»). Скрипт принимает POST с JSON:
 *     { secret?, key, headers: string[], row: string[] }
 *   и делает UPSERT по `key` (ищет в колонке A; обновляет строку или
 *   добавляет новую). headers пишутся в первую строку, если лист пуст.
 *
 * Мы шлём ПОЛНУЮ актуальную строку каждый раз — поэтому повторный
 * экспорт того же подписчика (например после заполнения email) просто
 * обновляет его строку, а не плодит дубли.
 */

import { db } from "../db";

/** Описание одной колонки в конфиге. */
export interface SheetColumn {
  /**
   * Что брать:
   *   chatId | firstName | lastName | username | tags | source |
   *   subscribedAt | lastSeenAt | field.<customKey> | var.<variableKey>
   */
  field: string;
  /** Заголовок колонки в таблице. */
  header: string;
}

/** Колонки по умолчанию, если в конфиге пусто. */
export const DEFAULT_SHEET_COLUMNS: SheetColumn[] = [
  { field: "chatId", header: "Chat ID" },
  { field: "firstName", header: "Имя" },
  { field: "lastName", header: "Фамилия" },
  { field: "username", header: "Username" },
  { field: "field.email", header: "Email" },
  { field: "field.phone", header: "Телефон" },
  { field: "field.utm_source", header: "UTM source" },
  { field: "field.utm_campaign", header: "UTM campaign" },
  { field: "tags", header: "Теги" },
  { field: "subscribedAt", header: "Подписался" },
];

/**
 * Вычисляет значение одной колонки для подписчика. Возвращает строку
 * (для таблицы всё — текст).
 */
function resolveField(
  field: string,
  sub: {
    chatId: string;
    firstName: string | null;
    lastName: string | null;
    username: string | null;
    tags: string[];
    subscribedAt: Date;
    lastSeenAt: Date | null;
    firstTouchSlug: string | null;
    customFields: unknown;
    variables: unknown;
  }
): string {
  if (field.startsWith("field.")) {
    const key = field.slice("field.".length);
    const cf = (sub.customFields as Record<string, unknown>) ?? {};
    const v = cf[key];
    return v == null ? "" : String(v);
  }
  if (field.startsWith("var.")) {
    const key = field.slice("var.".length);
    const vars = (sub.variables as Record<string, unknown>) ?? {};
    const v = vars[key];
    return v == null ? "" : String(v);
  }
  switch (field) {
    case "chatId":
      return sub.chatId;
    case "firstName":
      return sub.firstName ?? "";
    case "lastName":
      return sub.lastName ?? "";
    case "username":
      return sub.username ? `@${sub.username}` : "";
    case "tags":
      return (sub.tags ?? []).join(", ");
    case "source":
      return sub.firstTouchSlug ?? "";
    case "subscribedAt":
      return sub.subscribedAt.toISOString();
    case "lastSeenAt":
      return sub.lastSeenAt?.toISOString() ?? "";
    default:
      return "";
  }
}

/**
 * Экспортирует одного подписчика в Google Sheets (upsert по chat_id).
 * Best-effort: любая ошибка логируется в config.lastError, основной
 * поток не падает.
 *
 * reason — для логов («created» | «tag:<tag>» | «manual» | «cron»).
 */
export async function exportSubscriberToSheet(
  botId: string,
  subscriberId: string,
  reason: string = "created"
): Promise<{ ok: boolean; error?: string }> {
  try {
    const config = await db.tgGoogleSheetsConfig.findUnique({
      where: { botId },
    });
    if (!config || !config.enabled || !config.webhookUrl) {
      return { ok: false, error: "not configured" };
    }

    const sub = await db.tgSubscriber.findUnique({
      where: { id: subscriberId },
      select: {
        chatId: true,
        firstName: true,
        lastName: true,
        username: true,
        tags: true,
        subscribedAt: true,
        lastSeenAt: true,
        firstTouchSlug: true,
        customFields: true,
        variables: true,
      },
    });
    if (!sub) return { ok: false, error: "subscriber not found" };

    const columns = parseColumns(config.columns);
    const headers = columns.map((c) => c.header);
    const row = columns.map((c) => resolveField(c.field, sub));

    const body = {
      secret: config.secret || undefined,
      key: sub.chatId, // upsert-ключ — колонка A должна быть chat_id
      headers,
      row,
      reason,
    };

    const resp = await fetch(config.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // Apps Script может думать пару секунд — но не вечно.
      signal: AbortSignal.timeout(15_000),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      const err = `HTTP ${resp.status} ${text.slice(0, 200)}`;
      await db.tgGoogleSheetsConfig
        .update({ where: { botId }, data: { lastError: err } })
        .catch(() => {});
      return { ok: false, error: err };
    }

    await db.tgGoogleSheetsConfig
      .update({
        where: { botId },
        data: { lastOkAt: new Date(), lastError: null },
      })
      .catch(() => {});
    return { ok: true };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    await db.tgGoogleSheetsConfig
      .update({ where: { botId }, data: { lastError: err } })
      .catch(() => {});
    return { ok: false, error: err };
  }
}

/**
 * Хук на добавление тега — вызывается из fireTagTriggers. Если тег в
 * списке reexportTags, пере-выгружаем подписчика с актуальными данными.
 */
export async function maybeExportOnTag(
  botId: string,
  subscriberId: string,
  tag: string
): Promise<void> {
  try {
    const config = await db.tgGoogleSheetsConfig.findUnique({
      where: { botId },
      select: { enabled: true, reexportTags: true },
    });
    if (!config || !config.enabled) return;
    if (!config.reexportTags.includes(tag)) return;
    await exportSubscriberToSheet(botId, subscriberId, `tag:${tag}`);
  } catch {
    // best-effort
  }
}

function parseColumns(raw: unknown): SheetColumn[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_SHEET_COLUMNS;
  const out: SheetColumn[] = [];
  for (const c of raw) {
    if (
      c &&
      typeof c === "object" &&
      typeof (c as any).field === "string" &&
      typeof (c as any).header === "string"
    ) {
      out.push({ field: (c as any).field, header: (c as any).header });
    }
  }
  return out.length > 0 ? out : DEFAULT_SHEET_COLUMNS;
}
