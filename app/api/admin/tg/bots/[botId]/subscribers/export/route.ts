/**
 * GET /api/admin/tg/bots/[botId]/subscribers/export
 *
 * Скачивание всех подписчиков бота в CSV. UTF-8 с BOM (открывается в
 * Excel русской локали без kraбля), разделитель `;`.
 *
 * Что в выгрузке:
 *   • Стандартные поля: chat_id, username, ФИО, язык, теги, blocked.
 *   • Контакты/атрибуция: email, phone, все UTM, first/last touch.
 *   • LMS-связь: lms_email, lms_full_name (если подписчик слинкован).
 *   • ВСЕ кастомные поля бота (TgCustomField) — по колонке на каждое,
 *     заголовок = label поля.
 *   • Активность: subscribed_at, last_seen_at, messages_in, messages_out.
 *   • CJM (путь клиента): journey — компактная хронология вех (запуск
 *     сценария, теги, триггеры, рассылки) одной колонкой; last_flow и
 *     last_node — где подписчик сейчас в воронке.
 *
 * Колонки до custom-полей фиксированы — на них могут быть завязаны
 * IMPORTDATA / автоэкспорт. Кастомные поля идут после фиксированных.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import { UserRole } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Фиксированные колонки в начале.
const BASE_COLUMNS = [
  "chat_id",
  "username",
  "first_name",
  "last_name",
  "language_code",
  "email",
  "phone",
  "lms_email",
  "lms_full_name",
  "tags",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "first_touch_slug",
  "first_touch_at",
  "last_touch_slug",
  "last_touch_at",
  "subscribed_at",
  "last_seen_at",
  "is_blocked",
  "messages_in",
  "messages_out",
] as const;

// Колонки про подключённые TG-каналы (статус member; для статусов
// left/kicked поля пустые).
const CHANNEL_COLUMNS = [
  "channels_joined",
  "channels_first_join_at",
  "channels_invite_names",
] as const;

// CJM-колонки в конце.
const CJM_COLUMNS = ["journey", "last_flow", "last_node"] as const;

// Типы событий, попадающие в journey (вехи пути; шум message.* исключаем).
const JOURNEY_EVENT_TYPES = new Set<string>([
  "subscriber.created",
  "subscriber.lms_linked",
  "trigger.matched",
  "flow.started",
  "flow.completed",
  "flow.failed",
  "flow.cancelled",
  "tag.added",
  "tag.removed",
  "list.joined",
  "list.left",
  "broadcast.delivered",
  "scheduled_flow.completed",
]);

// Человекочитаемые лейблы типов для journey.
const EVENT_LABEL: Record<string, string> = {
  "subscriber.created": "пришёл",
  "subscriber.lms_linked": "привязан LMS",
  "trigger.matched": "триггер",
  "flow.started": "старт сценария",
  "flow.completed": "сценарий завершён",
  "flow.failed": "сценарий упал",
  "flow.cancelled": "сценарий отменён",
  "tag.added": "тег +",
  "tag.removed": "тег −",
  "list.joined": "в список",
  "list.left": "из списка",
  "broadcast.delivered": "рассылка",
  "scheduled_flow.completed": "плановый сценарий",
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ botId: string }> }
) {
  return withAuth(
    req,
    async () => {
      const { botId } = await params;

      const bot = await db.tgBot.findUnique({
        where: { id: botId },
        select: { id: true, username: true },
      });
      if (!bot) {
        return NextResponse.json(
          { success: false, error: "Бот не найден" },
          { status: 404 }
        );
      }

      // ── Справочники для обогащения ─────────────────────────────────
      // 1) Кастомные поля бота — динамические колонки.
      const customFieldDefs = await db.tgCustomField.findMany({
        where: { botId },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { key: true, label: true },
      });
      // 2) Воронки бота — id → name (для journey и last_flow).
      const flows = await db.tgFlow.findMany({
        where: { botId },
        select: { id: true, name: true },
      });
      const flowName = new Map(flows.map((f) => [f.id, f.name]));

      // ── Подписчики ─────────────────────────────────────────────────
      const subscribers = await db.tgSubscriber.findMany({
        where: { botId },
        orderBy: { subscribedAt: "asc" },
        select: {
          id: true,
          chatId: true,
          username: true,
          firstName: true,
          lastName: true,
          languageCode: true,
          tags: true,
          variables: true,
          customFields: true,
          firstTouchSlug: true,
          firstTouchAt: true,
          lastTouchSlug: true,
          lastTouchAt: true,
          subscribedAt: true,
          lastSeenAt: true,
          isBlocked: true,
          lmsUser: { select: { email: true, fullName: true } },
        },
      });

      const subIds = subscribers.map((s) => s.id);

      // ── Счётчики сообщений (groupBy — дёшево). ─────────────────────
      const msgCounts = new Map<string, { in: number; out: number }>();
      if (subIds.length > 0) {
        const grouped = await db.tgMessage.groupBy({
          by: ["subscriberId", "direction"],
          where: { botId, subscriberId: { in: subIds } },
          _count: { _all: true },
        });
        for (const g of grouped) {
          const cur = msgCounts.get(g.subscriberId) ?? { in: 0, out: 0 };
          if (g.direction === "in") cur.in += g._count._all;
          else if (g.direction === "out") cur.out += g._count._all;
          msgCounts.set(g.subscriberId, cur);
        }
      }

      // ── События-вехи для journey. Только milestone-типы (без шума
      //    message.*), ограничение по объёму — защита от гигантских баз.
      const journeyBySub = new Map<
        string,
        Array<{ at: Date; type: string; props: Record<string, unknown> }>
      >();
      if (subIds.length > 0) {
        const events = await db.tgEvent.findMany({
          where: {
            botId,
            subscriberId: { in: subIds },
            type: { in: Array.from(JOURNEY_EVENT_TYPES) },
          },
          orderBy: { occurredAt: "asc" },
          select: { subscriberId: true, type: true, properties: true, occurredAt: true },
          take: 200_000, // верхний предел — на очень больших базах journey усечётся
        });
        for (const e of events) {
          if (!e.subscriberId) continue;
          const arr = journeyBySub.get(e.subscriberId) ?? [];
          arr.push({
            at: e.occurredAt,
            type: e.type,
            props: (e.properties as Record<string, unknown>) ?? {},
          });
          journeyBySub.set(e.subscriberId, arr);
        }
      }

      // ── Подключённые каналы и активные membership'ы подписчика. ────
      // Считаем только status NOT IN (left, kicked) — то есть «сейчас
      // числится в канале».
      const channelTitleById = new Map<string, string>();
      const channels = await db.tgChannel.findMany({
        where: { botId },
        select: { id: true, title: true },
      });
      for (const c of channels) channelTitleById.set(c.id, c.title);

      const channelsBySub = new Map<
        string,
        { titles: string[]; firstJoinAt: Date | null; inviteNames: string[] }
      >();
      if (subIds.length > 0 && channels.length > 0) {
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
        for (const m of memberships) {
          if (!m.subscriberId) continue;
          const cur =
            channelsBySub.get(m.subscriberId) ?? {
              titles: [] as string[],
              firstJoinAt: null as Date | null,
              inviteNames: [] as string[],
            };
          const title = channelTitleById.get(m.channelId);
          if (title && !cur.titles.includes(title)) cur.titles.push(title);
          if (m.inviteLinkName && !cur.inviteNames.includes(m.inviteLinkName)) {
            cur.inviteNames.push(m.inviteLinkName);
          }
          if (m.joinedAt && (!cur.firstJoinAt || m.joinedAt < cur.firstJoinAt)) {
            cur.firstJoinAt = m.joinedAt;
          }
          channelsBySub.set(m.subscriberId, cur);
        }
      }

      // ── Текущая позиция в воронке (last_flow / last_node). ─────────
      const lastRunBySub = new Map<string, { flowId: string; node: string | null; status: string }>();
      if (subIds.length > 0) {
        const runs = await db.tgFlowRun.findMany({
          where: { subscriberId: { in: subIds }, flow: { botId } },
          orderBy: { startedAt: "desc" },
          select: {
            subscriberId: true,
            flowId: true,
            currentNodeId: true,
            status: true,
            startedAt: true,
          },
        });
        // findMany отсортирован по startedAt desc — первый на подписчика = последний run.
        for (const r of runs) {
          if (lastRunBySub.has(r.subscriberId)) continue;
          lastRunBySub.set(r.subscriberId, {
            flowId: r.flowId,
            node: r.currentNodeId,
            status: r.status,
          });
        }
      }

      // ── Заголовки: фиксированные + кастомные поля + CJM. ───────────
      const customHeaders = customFieldDefs.map(
        (f) => f.label || f.key
      );
      const allHeaders = [
        ...BASE_COLUMNS,
        ...customHeaders,
        ...CHANNEL_COLUMNS,
        ...CJM_COLUMNS,
      ];
      const rows: string[] = ["﻿" + allHeaders.map(csvEscape).join(";")];

      for (const s of subscribers) {
        const vars = (s.variables as Record<string, unknown> | null) ?? {};
        const cf = (s.customFields as Record<string, unknown> | null) ?? {};
        // Значение поля: сначала customFields, потом variables (разные
        // воронки кладут в разные scope).
        const fieldVal = (k: string): string => {
          const a = cf[k];
          if (a != null && a !== "") return String(a);
          const b = vars[k];
          return b == null ? "" : String(b);
        };

        const counts = msgCounts.get(s.id) ?? { in: 0, out: 0 };

        // journey: "01:49 старт сценария «X» → 01:50 тег + оплатил → ..."
        const journeyArr = journeyBySub.get(s.id) ?? [];
        const journey = journeyArr
          .map((e) => formatJourneyStep(e, flowName))
          .filter(Boolean)
          .join(" → ");

        const lastRun = lastRunBySub.get(s.id);
        const lastFlow = lastRun
          ? `${flowName.get(lastRun.flowId) ?? lastRun.flowId} (${lastRun.status})`
          : "";
        const lastNode = lastRun?.node ?? "";

        const baseRow = [
          s.chatId,
          s.username ?? "",
          s.firstName ?? "",
          s.lastName ?? "",
          s.languageCode ?? "",
          fieldVal("email"),
          fieldVal("phone"),
          s.lmsUser?.email ?? "",
          s.lmsUser?.fullName ?? "",
          (s.tags ?? []).join(","),
          fieldVal("utm_source"),
          fieldVal("utm_medium"),
          fieldVal("utm_campaign"),
          fieldVal("utm_content"),
          fieldVal("utm_term"),
          s.firstTouchSlug ?? "",
          s.firstTouchAt ? s.firstTouchAt.toISOString() : "",
          s.lastTouchSlug ?? "",
          s.lastTouchAt ? s.lastTouchAt.toISOString() : "",
          s.subscribedAt.toISOString(),
          s.lastSeenAt ? s.lastSeenAt.toISOString() : "",
          s.isBlocked ? "1" : "0",
          String(counts.in),
          String(counts.out),
        ];

        // Кастомные поля — в том же порядке, что заголовки.
        const customRow = customFieldDefs.map((f) => fieldVal(f.key));

        const ch = channelsBySub.get(s.id);
        const channelsRow = [
          (ch?.titles ?? []).join(","),
          ch?.firstJoinAt ? ch.firstJoinAt.toISOString() : "",
          (ch?.inviteNames ?? []).join(","),
        ];

        const cjmRow = [journey, lastFlow, lastNode];

        rows.push(
          [...baseRow, ...customRow, ...channelsRow, ...cjmRow]
            .map(csvEscape)
            .join(";")
        );
      }

      const csv = rows.join("\r\n");
      const date = new Date().toISOString().slice(0, 10);
      const filename = `subscribers_${bot.username || botId}_${date}.csv`;

      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}

/** Формат одного шага journey: "HH:MM <лейбл> <деталь>". */
function formatJourneyStep(
  e: { at: Date; type: string; props: Record<string, unknown> },
  flowName: Map<string, string>
): string {
  const time = e.at.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const label = EVENT_LABEL[e.type] ?? e.type;
  let detail = "";
  const p = e.props;
  if (e.type === "flow.started" || e.type === "flow.completed" || e.type === "flow.failed") {
    const fid = typeof p.flowId === "string" ? p.flowId : null;
    if (fid) detail = `«${flowName.get(fid) ?? fid}»`;
  } else if (e.type === "tag.added" || e.type === "tag.removed") {
    if (typeof p.tag === "string") detail = p.tag;
  } else if (e.type === "trigger.matched") {
    if (typeof p.triggerType === "string") detail = String(p.triggerType);
  } else if (e.type === "broadcast.delivered") {
    if (typeof p.broadcastName === "string") detail = `«${p.broadcastName}»`;
  }
  return `${time} ${label}${detail ? " " + detail : ""}`;
}

/**
 * Минимальный CSV-эскейпер для разделителя `;`. Оборачиваем в кавычки,
 * если есть `;`, `"`, переводы строк или ведущие нули (chat_id/phone).
 */
function csvEscape(value: string): string {
  const needsQuote =
    value.includes(";") ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r") ||
    /^0\d/.test(value);
  if (!needsQuote) return value;
  return `"${value.replace(/"/g, '""')}"`;
}
