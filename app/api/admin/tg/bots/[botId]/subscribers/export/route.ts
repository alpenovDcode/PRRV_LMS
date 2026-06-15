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
 *   • Каналы: channels_joined, channels_first_join_at, channels_invite_names.
 *   • Маркетинг (всё что во вкладке «Маркетинг» досье):
 *       - конверсия по воронкам: flows_started/completed/cancelled/failed
 *         + conversion_rate (%);
 *       - кнопки: button_clicks (нажатий по inline-кнопкам);
 *       - ссылки: link_clicks_detail (детально по slug: "slug=N", через ;);
 *       - A/B: ab_variants (выбранные варианты split-ноды);
 *       - рассылки: broadcasts_detail (Имя:status:дата через ;);
 *       - история тегов/списков: tag_history (+тег ДД.ММ; -список ДД.ММ);
 *       - first_touch_name / last_touch_name — название tracking link.
 *   • CJM-сводка: journey (компактная строка вех), last_flow, last_node.
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

// Активность по рассылкам / ссылкам (TgBroadcastRecipient + TgRedirectLink).
const ENGAGEMENT_COLUMNS = [
  "broadcasts_received",     // сколько рассылок реально доставлено
  "link_clicks",             // всего кликов по трекинг-ссылкам
  "last_link_click_at",      // время последнего клика
] as const;

// Маркетинговая часть досье — точно те же сущности, что во вкладке
// «Маркетинг» карточки лида (lead-marketing.tsx). Колонки идут перед
// CJM-сводкой, чтобы фиксированные позиции до этого блока не съезжали.
const MARKETING_COLUMNS = [
  // Конверсия по воронкам (по TgFlowRun.status).
  "flows_started",
  "flows_completed",
  "flows_cancelled",
  "flows_failed",
  "conversion_rate",         // процент: completed / started * 100
  // Взаимодействие.
  "button_clicks",           // нажатий по inline-кнопкам (callbackData != null)
  // Клики по ссылкам в разрезе slug: "MnHFzygH74=2; prepodavai_varya=1".
  "link_clicks_detail",
  // A/B-эксперименты: список выбранных вариантов через "; "
  // (например "headline-v1; cta-blue").
  "ab_variants",
  // Имя tracking-link для first / last touch (UTM-кампания «по-человечески»).
  "first_touch_name",
  "last_touch_name",
  // Полученные рассылки — "Имя:status:дата" через "; ".
  "broadcasts_detail",
  // История тегов и списков: "+тег ДД.ММ; -тег ДД.ММ; +список ДД.ММ".
  "tag_history",
] as const;

// CJM-колонки в конце.
const CJM_COLUMNS = ["journey", "last_flow", "last_node"] as const;

// Типы событий, попадающие в journey (вехи пути; шум message.*/node_executed
// исключаем — это десятки тысяч строк на активного лида).
// ВАЖНО: имена должны совпадать с теми, что trackEvent пишет в БД
// (см. lib/tg/events.ts → TgEventType). Раньше тут были придуманные
// имена вроде "tag.added" / "flow.started" / "redirect.clicked" — БД их
// не знает, поэтому journey у всех был пустым по тегам и кликам.
const JOURNEY_EVENT_TYPES = new Set<string>([
  "subscriber.created",
  "subscriber.tag_added",
  "subscriber.tag_removed",
  "subscriber.list_joined",
  "subscriber.list_left",
  "flow.entered",
  "flow.completed",
  "flow.failed",
  "flow.cancelled",
  "flow.ab_split",
  "broadcast.delivered",
  "link.clicked",
]);

// Человекочитаемые лейблы типов для journey.
const EVENT_LABEL: Record<string, string> = {
  "subscriber.created": "пришёл",
  "subscriber.tag_added": "тег +",
  "subscriber.tag_removed": "тег −",
  "subscriber.list_joined": "в список",
  "subscriber.list_left": "из списка",
  "flow.entered": "старт сценария",
  "flow.completed": "сценарий завершён",
  "flow.failed": "сценарий упал",
  "flow.cancelled": "сценарий отменён",
  "flow.ab_split": "A/B вариант",
  "broadcast.delivered": "рассылка",
  "link.clicked": "клик по ссылке",
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

      // ── Активность по рассылкам и трекинг-ссылкам. ─────────────────
      // Рассылки считаем по TgBroadcastRecipient.status=sent — это значит,
      // сообщение успешно отправлено в Telegram (не учитываем skipped/failed).
      const engagementBySub = new Map<
        string,
        { broadcasts: number; clicks: number; lastClickAt: Date | null }
      >();
      if (subIds.length > 0) {
        const recs = await db.tgBroadcastRecipient.groupBy({
          by: ["subscriberId"],
          where: { subscriberId: { in: subIds }, status: "sent" },
          _count: { _all: true },
        });
        for (const r of recs) {
          const cur = engagementBySub.get(r.subscriberId) ?? {
            broadcasts: 0,
            clicks: 0,
            lastClickAt: null as Date | null,
          };
          cur.broadcasts = r._count._all;
          engagementBySub.set(r.subscriberId, cur);
        }
        // Клики берём из tg_redirect_links: clickCount уже агрегирован,
        // last_click_at — самый свежий клик по любой ссылке подписчика.
        const links = await db.tgRedirectLink.findMany({
          where: { botId, subscriberId: { in: subIds }, clickCount: { gt: 0 } },
          select: { subscriberId: true, clickCount: true, lastClickAt: true },
        });
        for (const l of links) {
          if (!l.subscriberId) continue;
          const cur = engagementBySub.get(l.subscriberId) ?? {
            broadcasts: 0,
            clicks: 0,
            lastClickAt: null as Date | null,
          };
          cur.clicks += l.clickCount;
          if (l.lastClickAt && (!cur.lastClickAt || l.lastClickAt > cur.lastClickAt)) {
            cur.lastClickAt = l.lastClickAt;
          }
          engagementBySub.set(l.subscriberId, cur);
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

      // ── Конверсия по воронкам: status-агрегаты на подписчика. ──────
      // Источник тот же, что в /dossier: TgFlowRun, ограничение по botId
      // через relation (на нём нет прямого botId-столбца).
      const conversionBySub = new Map<
        string,
        { started: number; completed: number; cancelled: number; failed: number }
      >();
      if (subIds.length > 0) {
        const runs = await db.tgFlowRun.groupBy({
          by: ["subscriberId", "status"],
          where: { subscriberId: { in: subIds }, flow: { botId } },
          _count: { _all: true },
        });
        for (const r of runs) {
          const cur = conversionBySub.get(r.subscriberId) ?? {
            started: 0,
            completed: 0,
            cancelled: 0,
            failed: 0,
          };
          cur.started += r._count._all;
          if (r.status === "completed") cur.completed += r._count._all;
          else if (r.status === "cancelled") cur.cancelled += r._count._all;
          else if (r.status === "failed") cur.failed += r._count._all;
          conversionBySub.set(r.subscriberId, cur);
        }
      }

      // ── Нажатия по inline-кнопкам: callbackData у входящих сообщений. ─
      const buttonClicksBySub = new Map<string, number>();
      if (subIds.length > 0) {
        const grouped = await db.tgMessage.groupBy({
          by: ["subscriberId"],
          where: {
            botId,
            subscriberId: { in: subIds },
            direction: "in",
            callbackData: { not: null },
          },
          _count: { _all: true },
        });
        for (const g of grouped) {
          buttonClicksBySub.set(g.subscriberId, g._count._all);
        }
      }

      // ── Клики по ссылкам в разрезе slug. Одна нить с агрегатами
      //    TgRedirectLink (slug+clickCount уже хранится). Это даёт
      //    "MnHFzygH74=2; prepodavai_varya=1" без выкачивания каждого
      //    отдельного клика из TgEvent.
      const linkDetailBySub = new Map<string, Array<{ slug: string; count: number }>>();
      if (subIds.length > 0) {
        const detailLinks = await db.tgRedirectLink.findMany({
          where: { botId, subscriberId: { in: subIds }, clickCount: { gt: 0 } },
          orderBy: { clickCount: "desc" },
          select: { subscriberId: true, slug: true, clickCount: true },
        });
        for (const l of detailLinks) {
          if (!l.subscriberId) continue;
          const arr = linkDetailBySub.get(l.subscriberId) ?? [];
          arr.push({ slug: l.slug, count: l.clickCount });
          linkDetailBySub.set(l.subscriberId, arr);
        }
      }

      // ── A/B-варианты: flow.ab_split.properties.variant в порядке выпадения. ─
      const abVariantsBySub = new Map<string, string[]>();
      if (subIds.length > 0) {
        const ab = await db.tgEvent.findMany({
          where: {
            botId,
            subscriberId: { in: subIds },
            type: "flow.ab_split",
          },
          orderBy: { occurredAt: "asc" },
          select: { subscriberId: true, properties: true },
          take: 50_000,
        });
        for (const e of ab) {
          if (!e.subscriberId) continue;
          const v = (e.properties as { variant?: unknown } | null)?.variant;
          if (typeof v !== "string" || !v) continue;
          const arr = abVariantsBySub.get(e.subscriberId) ?? [];
          arr.push(v);
          abVariantsBySub.set(e.subscriberId, arr);
        }
      }

      // ── Полные рассылки (включая failed/skipped) — формат "Имя:status:дата".
      const broadcastsDetailBySub = new Map<
        string,
        Array<{ name: string; status: string; sentAt: Date | null }>
      >();
      if (subIds.length > 0) {
        const recs = await db.tgBroadcastRecipient.findMany({
          where: { subscriberId: { in: subIds }, broadcast: { botId } },
          orderBy: [{ sentAt: "desc" }, { id: "desc" }],
          take: 100_000,
          select: {
            subscriberId: true,
            status: true,
            sentAt: true,
            broadcast: { select: { name: true } },
          },
        });
        for (const r of recs) {
          const arr = broadcastsDetailBySub.get(r.subscriberId) ?? [];
          arr.push({
            name: r.broadcast?.name ?? "(без имени)",
            status: r.status,
            sentAt: r.sentAt,
          });
          broadcastsDetailBySub.set(r.subscriberId, arr);
        }
      }

      // ── История тегов и списков: уже выкачана в journeyBySub (теперь
      //    с правильными именами событий), просто фильтруем нужные типы.
      // Сделано здесь же чтобы не дублировать запрос.
      const TAG_LIST_TYPES = new Set([
        "subscriber.tag_added",
        "subscriber.tag_removed",
        "subscriber.list_joined",
        "subscriber.list_left",
      ]);

      // ── Имена tracking-link для UTM-атрибуции (first_touch_name /
      //    last_touch_name). Резолвим за один запрос по всем уникальным
      //    slug, которые встречаются у выгружаемых подписчиков.
      const allTouchSlugs = new Set<string>();
      for (const s of subscribers) {
        if (s.firstTouchSlug) allTouchSlugs.add(s.firstTouchSlug);
        if (s.lastTouchSlug) allTouchSlugs.add(s.lastTouchSlug);
      }
      const touchNameBySlug = new Map<string, string>();
      if (allTouchSlugs.size > 0) {
        const tl = await db.tgTrackingLink.findMany({
          where: { botId, slug: { in: Array.from(allTouchSlugs) } },
          select: { slug: true, name: true },
        });
        for (const l of tl) {
          if (l.name) touchNameBySlug.set(l.slug, l.name);
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
        ...ENGAGEMENT_COLUMNS,
        ...MARKETING_COLUMNS,
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

        const eng = engagementBySub.get(s.id);
        const engagementRow = [
          String(eng?.broadcasts ?? 0),
          String(eng?.clicks ?? 0),
          eng?.lastClickAt ? eng.lastClickAt.toISOString() : "",
        ];

        // — Маркетинговый блок —
        const conv = conversionBySub.get(s.id);
        const flowsStarted = conv?.started ?? 0;
        const flowsCompleted = conv?.completed ?? 0;
        const flowsCancelled = conv?.cancelled ?? 0;
        const flowsFailed = conv?.failed ?? 0;
        const conversionRate =
          flowsStarted > 0
            ? Math.round((flowsCompleted / flowsStarted) * 1000) / 10
            : 0;

        const linkDetail = (linkDetailBySub.get(s.id) ?? [])
          .map((l) => `${l.slug}=${l.count}`)
          .join("; ");

        const abVariants = (abVariantsBySub.get(s.id) ?? []).join("; ");

        const broadcastsDetail = (broadcastsDetailBySub.get(s.id) ?? [])
          .map((b) => {
            const date = b.sentAt
              ? b.sentAt.toLocaleDateString("ru-RU", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "2-digit",
                })
              : "—";
            return `${b.name}:${b.status}:${date}`;
          })
          .join("; ");

        const tagHistory = journeyArr
          .filter((e) => TAG_LIST_TYPES.has(e.type))
          .map((e) => {
            const date = e.at.toLocaleDateString("ru-RU", {
              day: "2-digit",
              month: "2-digit",
            });
            const sign =
              e.type === "subscriber.tag_added" ||
              e.type === "subscriber.list_joined"
                ? "+"
                : "−";
            const kind = e.type.includes("list") ? "список " : "";
            const label =
              typeof e.props.tag === "string"
                ? e.props.tag
                : typeof e.props.listName === "string"
                  ? e.props.listName
                  : typeof e.props.listId === "string"
                    ? e.props.listId
                    : "—";
            return `${sign}${kind}${label} ${date}`;
          })
          .join("; ");

        const firstTouchName = s.firstTouchSlug
          ? (touchNameBySlug.get(s.firstTouchSlug) ?? "")
          : "";
        const lastTouchName = s.lastTouchSlug
          ? (touchNameBySlug.get(s.lastTouchSlug) ?? "")
          : "";

        const marketingRow = [
          String(flowsStarted),
          String(flowsCompleted),
          String(flowsCancelled),
          String(flowsFailed),
          flowsStarted > 0 ? `${conversionRate}%` : "",
          String(buttonClicksBySub.get(s.id) ?? 0),
          linkDetail,
          abVariants,
          firstTouchName,
          lastTouchName,
          broadcastsDetail,
          tagHistory,
        ];

        const cjmRow = [journey, lastFlow, lastNode];

        rows.push(
          [
            ...baseRow,
            ...customRow,
            ...channelsRow,
            ...engagementRow,
            ...marketingRow,
            ...cjmRow,
          ]
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
  if (
    e.type === "flow.entered" ||
    e.type === "flow.completed" ||
    e.type === "flow.failed" ||
    e.type === "flow.cancelled"
  ) {
    const fid = typeof p.flowId === "string" ? p.flowId : null;
    if (fid) detail = `«${flowName.get(fid) ?? fid}»`;
  } else if (
    e.type === "subscriber.tag_added" ||
    e.type === "subscriber.tag_removed"
  ) {
    if (typeof p.tag === "string") detail = p.tag;
  } else if (
    e.type === "subscriber.list_joined" ||
    e.type === "subscriber.list_left"
  ) {
    if (typeof p.listName === "string") detail = p.listName;
    else if (typeof p.listId === "string") detail = p.listId;
  } else if (e.type === "broadcast.delivered") {
    if (typeof p.broadcastName === "string") detail = `«${p.broadcastName}»`;
  } else if (e.type === "link.clicked") {
    if (typeof p.slug === "string") detail = p.slug;
    else if (typeof p.target === "string") detail = p.target;
  } else if (e.type === "flow.ab_split") {
    if (typeof p.variant === "string") detail = p.variant;
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
