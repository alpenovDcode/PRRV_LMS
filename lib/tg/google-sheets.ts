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
 * Полный набор колонок — паритет с CSV-выгрузкой подписчиков. Кнопка
 * «Добавить все поля» в UI подставляет именно его. chatId обязательно
 * первый (ключ upsert).
 */
export const FULL_SHEET_COLUMNS: SheetColumn[] = [
  { field: "chatId", header: "Chat ID" },
  { field: "username", header: "Username" },
  { field: "firstName", header: "Имя" },
  { field: "lastName", header: "Фамилия" },
  { field: "languageCode", header: "Язык" },
  { field: "field.email", header: "Email" },
  { field: "field.phone", header: "Телефон" },
  { field: "lmsEmail", header: "LMS email" },
  { field: "lmsName", header: "LMS ФИО" },
  { field: "tags", header: "Теги" },
  { field: "field.utm_source", header: "UTM source" },
  { field: "field.utm_medium", header: "UTM medium" },
  { field: "field.utm_campaign", header: "UTM campaign" },
  { field: "field.utm_content", header: "UTM content" },
  { field: "field.utm_term", header: "UTM term" },
  { field: "firstTouchSlug", header: "Первое касание (slug)" },
  { field: "firstTouchAt", header: "Первое касание (время)" },
  { field: "lastTouchSlug", header: "Последнее касание (slug)" },
  { field: "lastTouchAt", header: "Последнее касание (время)" },
  { field: "subscribedAt", header: "Подписался" },
  { field: "lastSeenAt", header: "Последняя активность" },
  { field: "isBlocked", header: "Заблокировал бота" },
  { field: "messagesIn", header: "Входящих" },
  { field: "messagesOut", header: "Исходящих" },
  { field: "channelsJoined", header: "Каналы (сейчас)" },
  { field: "channelsFirstJoinAt", header: "Первое вступление в канал" },
  { field: "channelsInviteNames", header: "Через какие invite-link" },
  { field: "journey", header: "Путь клиента (CJM)" },
  { field: "lastFlow", header: "Текущая воронка" },
  { field: "lastNode", header: "Текущий узел" },
];

/** Расширенный набор данных подписчика для построения строки. */
export interface SubData {
  id: string;
  chatId: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  languageCode: string | null;
  tags: string[];
  subscribedAt: Date;
  lastSeenAt: Date | null;
  isBlocked: boolean;
  firstTouchSlug: string | null;
  firstTouchAt: Date | null;
  lastTouchSlug: string | null;
  lastTouchAt: Date | null;
  customFields: unknown;
  variables: unknown;
  lmsUser: { email: string; fullName: string | null } | null;
}

/** Тяжёлые вычисляемые поля (считаются только если нужны колонки). */
export interface SubExtras {
  messagesIn: number;
  messagesOut: number;
  journey: string;
  lastFlow: string;
  lastNode: string;
  channelsJoined: string;
  channelsFirstJoinAt: string;
  channelsInviteNames: string;
}

const EMPTY_EXTRAS: SubExtras = {
  messagesIn: 0,
  messagesOut: 0,
  journey: "",
  lastFlow: "",
  lastNode: "",
  channelsJoined: "",
  channelsFirstJoinAt: "",
  channelsInviteNames: "",
};

/** Колонки, требующие тяжёлых данных (сообщения / события / runs). */
export function neededExtras(columns: SheetColumn[]): {
  messages: boolean;
  journey: boolean;
  channels: boolean;
} {
  const fields = new Set(columns.map((c) => c.field));
  return {
    messages: fields.has("messagesIn") || fields.has("messagesOut"),
    journey:
      fields.has("journey") || fields.has("lastFlow") || fields.has("lastNode"),
    channels:
      fields.has("channelsJoined") ||
      fields.has("channelsFirstJoinAt") ||
      fields.has("channelsInviteNames"),
  };
}

/**
 * Вычисляет значение одной колонки. Всё приводится к строке.
 */
function resolveField(field: string, sub: SubData, extras: SubExtras): string {
  if (field.startsWith("field.")) {
    const key = field.slice("field.".length);
    const cf = (sub.customFields as Record<string, unknown>) ?? {};
    const a = cf[key];
    if (a != null && a !== "") return String(a);
    // fallback на variables (разные воронки кладут в разный scope)
    const vars = (sub.variables as Record<string, unknown>) ?? {};
    const b = vars[key];
    return b == null ? "" : String(b);
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
    case "languageCode":
      return sub.languageCode ?? "";
    case "tags":
      return (sub.tags ?? []).join(", ");
    case "source":
      return sub.firstTouchSlug ?? "";
    case "lmsEmail":
      return sub.lmsUser?.email ?? "";
    case "lmsName":
      return sub.lmsUser?.fullName ?? "";
    case "firstTouchSlug":
      return sub.firstTouchSlug ?? "";
    case "firstTouchAt":
      return sub.firstTouchAt?.toISOString() ?? "";
    case "lastTouchSlug":
      return sub.lastTouchSlug ?? "";
    case "lastTouchAt":
      return sub.lastTouchAt?.toISOString() ?? "";
    case "subscribedAt":
      return sub.subscribedAt.toISOString();
    case "lastSeenAt":
      return sub.lastSeenAt?.toISOString() ?? "";
    case "isBlocked":
      return sub.isBlocked ? "1" : "0";
    case "messagesIn":
      return String(extras.messagesIn);
    case "messagesOut":
      return String(extras.messagesOut);
    case "journey":
      return extras.journey;
    case "lastFlow":
      return extras.lastFlow;
    case "lastNode":
      return extras.lastNode;
    case "channelsJoined":
      return extras.channelsJoined;
    case "channelsFirstJoinAt":
      return extras.channelsFirstJoinAt;
    case "channelsInviteNames":
      return extras.channelsInviteNames;
    default:
      return "";
  }
}

/** Поля select для SubData. */
const SUB_DATA_SELECT = {
  id: true,
  chatId: true,
  firstName: true,
  lastName: true,
  username: true,
  languageCode: true,
  tags: true,
  subscribedAt: true,
  lastSeenAt: true,
  isBlocked: true,
  firstTouchSlug: true,
  firstTouchAt: true,
  lastTouchSlug: true,
  lastTouchAt: true,
  customFields: true,
  variables: true,
  lmsUser: { select: { email: true, fullName: true } },
} as const;

// ── CJM (journey) ───────────────────────────────────────────────────────
const JOURNEY_EVENT_TYPES = [
  "subscriber.created",
  "subscriber.lms_linked",
  "trigger.matched",
  "flow.started",
  "flow.completed",
  "flow.failed",
  "tag.added",
  "tag.removed",
  "list.joined",
  "list.left",
  "broadcast.delivered",
];
const EVENT_LABEL: Record<string, string> = {
  "subscriber.created": "пришёл",
  "subscriber.lms_linked": "привязан LMS",
  "trigger.matched": "триггер",
  "flow.started": "старт сценария",
  "flow.completed": "сценарий завершён",
  "flow.failed": "сценарий упал",
  "tag.added": "тег +",
  "tag.removed": "тег −",
  "list.joined": "в список",
  "list.left": "из списка",
  "broadcast.delivered": "рассылка",
};

function formatJourneyStep(
  at: Date,
  type: string,
  props: Record<string, unknown>,
  flowName: Map<string, string>
): string {
  const time = at.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const label = EVENT_LABEL[type] ?? type;
  let detail = "";
  if (type === "flow.started" || type === "flow.completed" || type === "flow.failed") {
    const fid = typeof props.flowId === "string" ? props.flowId : null;
    if (fid) detail = `«${flowName.get(fid) ?? fid}»`;
  } else if ((type === "tag.added" || type === "tag.removed") && typeof props.tag === "string") {
    detail = props.tag;
  }
  return `${time} ${label}${detail ? " " + detail : ""}`;
}

/**
 * Считает extras (сообщения / journey / текущая воронка) для набора
 * подписчиков — bulk-запросами. `which` управляет тем, что вообще
 * считать (чтобы не делать лишних запросов когда колонки не нужны).
 */
async function computeExtras(
  botId: string,
  subIds: string[],
  which: { messages: boolean; journey: boolean; channels: boolean }
): Promise<Map<string, SubExtras>> {
  const out = new Map<string, SubExtras>();
  for (const id of subIds) out.set(id, { ...EMPTY_EXTRAS });
  if (
    subIds.length === 0 ||
    (!which.messages && !which.journey && !which.channels)
  )
    return out;

  if (which.messages) {
    const grouped = await db.tgMessage.groupBy({
      by: ["subscriberId", "direction"],
      where: { botId, subscriberId: { in: subIds } },
      _count: { _all: true },
    });
    for (const g of grouped) {
      const e = out.get(g.subscriberId);
      if (!e) continue;
      if (g.direction === "in") e.messagesIn += g._count._all;
      else if (g.direction === "out") e.messagesOut += g._count._all;
    }
  }

  if (which.journey) {
    const flows = await db.tgFlow.findMany({
      where: { botId },
      select: { id: true, name: true },
    });
    const flowName = new Map(flows.map((f) => [f.id, f.name]));

    const events = await db.tgEvent.findMany({
      where: { botId, subscriberId: { in: subIds }, type: { in: JOURNEY_EVENT_TYPES } },
      orderBy: { occurredAt: "asc" },
      select: { subscriberId: true, type: true, properties: true, occurredAt: true },
      take: 200_000,
    });
    const stepsBySub = new Map<string, string[]>();
    for (const ev of events) {
      if (!ev.subscriberId) continue;
      const arr = stepsBySub.get(ev.subscriberId) ?? [];
      arr.push(
        formatJourneyStep(
          ev.occurredAt,
          ev.type,
          (ev.properties as Record<string, unknown>) ?? {},
          flowName
        )
      );
      stepsBySub.set(ev.subscriberId, arr);
    }
    for (const [sid, steps] of stepsBySub) {
      const e = out.get(sid);
      if (e) e.journey = steps.join(" → ");
    }

    const runs = await db.tgFlowRun.findMany({
      where: { subscriberId: { in: subIds }, flow: { botId } },
      orderBy: { startedAt: "desc" },
      select: { subscriberId: true, flowId: true, currentNodeId: true, status: true },
    });
    const seenRun = new Set<string>();
    for (const r of runs) {
      if (seenRun.has(r.subscriberId)) continue;
      seenRun.add(r.subscriberId);
      const e = out.get(r.subscriberId);
      if (e) {
        e.lastFlow = `${flowName.get(r.flowId) ?? r.flowId} (${r.status})`;
        e.lastNode = r.currentNodeId ?? "";
      }
    }
  }

  if (which.channels) {
    const channels = await db.tgChannel.findMany({
      where: { botId },
      select: { id: true, title: true },
    });
    const titleById = new Map(channels.map((c) => [c.id, c.title]));
    if (channels.length > 0) {
      const memberships = await db.tgChannelMembership.findMany({
        where: {
          botId,
          subscriberId: { in: subIds },
          status: { notIn: ["left", "kicked"] },
        },
        select: {
          subscriberId: true,
          channelId: true,
          joinedAt: true,
          inviteLinkName: true,
        },
      });
      const aggBySub = new Map<
        string,
        { titles: Set<string>; firstJoin: Date | null; invites: Set<string> }
      >();
      for (const m of memberships) {
        if (!m.subscriberId) continue;
        const cur =
          aggBySub.get(m.subscriberId) ?? {
            titles: new Set<string>(),
            firstJoin: null as Date | null,
            invites: new Set<string>(),
          };
        const t = titleById.get(m.channelId);
        if (t) cur.titles.add(t);
        if (m.inviteLinkName) cur.invites.add(m.inviteLinkName);
        if (m.joinedAt && (!cur.firstJoin || m.joinedAt < cur.firstJoin)) {
          cur.firstJoin = m.joinedAt;
        }
        aggBySub.set(m.subscriberId, cur);
      }
      for (const [sid, agg] of aggBySub) {
        const e = out.get(sid);
        if (!e) continue;
        e.channelsJoined = Array.from(agg.titles).join(", ");
        e.channelsInviteNames = Array.from(agg.invites).join(", ");
        e.channelsFirstJoinAt = agg.firstJoin ? agg.firstJoin.toISOString() : "";
      }
    }
  }

  return out;
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
      select: SUB_DATA_SELECT,
    });
    if (!sub) return { ok: false, error: "subscriber not found" };

    const columns = parseColumns(config.columns);
    const headers = columns.map((c) => c.header);
    // extras считаем только если в колонках есть тяжёлые поля.
    const which = neededExtras(columns);
    const extrasMap = await computeExtras(botId, [sub.id], which);
    const extras = extrasMap.get(sub.id) ?? EMPTY_EXTRAS;
    const row = columns.map((c) => resolveField(c.field, sub as SubData, extras));

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
      // Apps Script отвечает 302 → googleusercontent; fetch следует за
      // редиректом сам (redirect: "follow" по умолчанию).
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });

    const text = await resp.text().catch(() => "");

    if (!resp.ok) {
      const err = `HTTP ${resp.status} ${text.slice(0, 200)}`;
      await db.tgGoogleSheetsConfig
        .update({ where: { botId }, data: { lastError: err } })
        .catch(() => {});
      return { ok: false, error: err };
    }

    // КЛЮЧЕВАЯ ПРОВЕРКА: статус 200 ещё НЕ значит успех. Если деплой
    // Apps Script не «Кто угодно» (или скрипт не авторизован), Google
    // редиректит POST на страницу логина — она отдаёт 200 с HTML, а
    // doPost даже не запускается. Поэтому считаем успехом ТОЛЬКО если
    // тело — наш JSON { ok: true }. HTML ⇒ неверный деплой.
    const trimmed = text.trim();
    const looksHtml =
      trimmed.startsWith("<") ||
      trimmed.toLowerCase().includes("<!doctype") ||
      trimmed.toLowerCase().includes("<html");
    let parsed: any = null;
    if (!looksHtml) {
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        /* не JSON */
      }
    }

    if (looksHtml) {
      const err =
        "Вебхук вернул HTML вместо JSON. Скорее всего деплой Apps Script " +
        "сделан НЕ с доступом «Кто угодно», либо скрипт не авторизован. " +
        "Передеплойте Web App с доступом «Кто угодно» и при первом запуске " +
        "нажмите «Разрешить доступ».";
      await db.tgGoogleSheetsConfig
        .update({ where: { botId }, data: { lastError: err } })
        .catch(() => {});
      return { ok: false, error: err };
    }
    if (parsed && parsed.error) {
      const err = `Скрипт вернул ошибку: ${String(parsed.error).slice(0, 200)}`;
      await db.tgGoogleSheetsConfig
        .update({ where: { botId }, data: { lastError: err } })
        .catch(() => {});
      return { ok: false, error: err };
    }
    // parsed.ok === true (или просто валидный JSON без error) — успех.

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

/** Проверяет, что ответ Apps Script — наш JSON, а не HTML логина Google. */
function isHtmlResponse(text: string): boolean {
  const t = text.trim().toLowerCase();
  return t.startsWith("<") || t.includes("<html") || t.includes("<!doctype");
}

/**
 * Массовая выгрузка ВСЕЙ базы подписчиков бота в таблицу. Шлёт строки
 * батчами (массив `rows` в одном POST) — для 200+ подписчиков это
 * 1-2 запроса вместо сотен. Скрипт upsert'ит каждую строку по первой
 * колонке (chat_id).
 *
 * Возвращает { total, sent, failed, error? }. error — если конфиг не
 * готов или первый батч провалился (нет смысла слать остальные).
 */
export async function exportAllSubscribers(
  botId: string
): Promise<{ total: number; sent: number; failed: number; error?: string }> {
  const config = await db.tgGoogleSheetsConfig.findUnique({ where: { botId } });
  if (!config || !config.webhookUrl) {
    return { total: 0, sent: 0, failed: 0, error: "Не задан Webhook URL" };
  }

  const subs = await db.tgSubscriber.findMany({
    where: { botId },
    orderBy: { subscribedAt: "asc" },
    select: SUB_DATA_SELECT,
  });

  const columns = parseColumns(config.columns);
  const headers = columns.map((c) => c.header);
  const which = neededExtras(columns);
  const extrasMap = await computeExtras(
    botId,
    subs.map((s) => s.id),
    which
  );
  const allRows = subs.map((s) =>
    columns.map((c) =>
      resolveField(c.field, s as SubData, extrasMap.get(s.id) ?? EMPTY_EXTRAS)
    )
  );

  const BATCH = 200;
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < allRows.length; i += BATCH) {
    const batchRows = allRows.slice(i, i + BATCH);
    try {
      const resp = await fetch(config.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: config.secret || undefined,
          headers,
          rows: batchRows, // ← батч: массив строк, upsert по первой колонке
          reason: "export_all",
        }),
        redirect: "follow",
        signal: AbortSignal.timeout(60_000), // батч большой — даём минуту
      });
      const text = await resp.text().catch(() => "");
      // Парсим ответ: новый скрипт возвращает { ok, written: N }. Если
      // поля written НЕТ — задеплоен СТАРЫЙ скрипт без поддержки батча,
      // он молча проигнорировал rows[]. Это и есть «выгрузилось 0».
      let parsed: any = null;
      if (!isHtmlResponse(text)) {
        try {
          parsed = JSON.parse(text.trim());
        } catch {
          /* не JSON */
        }
      }
      const oldScript =
        resp.ok &&
        !isHtmlResponse(text) &&
        parsed &&
        typeof parsed.written === "undefined";

      if (!resp.ok || isHtmlResponse(text) || oldScript) {
        const err = isHtmlResponse(text)
          ? "Вебхук вернул HTML — деплой Apps Script не «Кто угодно» или скрипт не авторизован."
          : oldScript
            ? "Скрипт Apps Script устарел (не поддерживает массовую выгрузку). " +
              "Скопируйте новый скрипт из инструкции выше, замените код и " +
              "передеплойте (Управление развёртываниями → Новая версия)."
            : `HTTP ${resp.status} ${text.slice(0, 150)}`;
        // Первый батч провалился — нет смысла продолжать.
        if (i === 0) {
          await db.tgGoogleSheetsConfig
            .update({ where: { botId }, data: { lastError: err } })
            .catch(() => {});
          return { total: subs.length, sent, failed, error: err };
        }
        failed += batchRows.length;
        continue;
      }
      sent += batchRows.length;
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      if (i === 0) {
        await db.tgGoogleSheetsConfig
          .update({ where: { botId }, data: { lastError: err } })
          .catch(() => {});
        return { total: subs.length, sent, failed, error: err };
      }
      failed += batchRows.length;
    }
  }

  await db.tgGoogleSheetsConfig
    .update({
      where: { botId },
      data: { lastOkAt: new Date(), lastError: failed > 0 ? `частично: не дошло ${failed}` : null },
    })
    .catch(() => {});

  return { total: subs.length, sent, failed };
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
