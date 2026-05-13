// Pure helpers for the lead-conversation chat view.
// Kept free of React / DOM so they can be tested with vitest (node env).

/**
 * Minimal message shape consumed by the chat UI. We only depend on the
 * fields the renderer actually reads — keeps tests trivial and decouples
 * helpers from the Prisma row type.
 */
export interface ChatMessageLike {
  id: string;
  direction: "in" | "out" | string;
  createdAt: string | Date;
}

export interface MessageBurst<M extends ChatMessageLike> {
  /** Direction shared by every message in the burst. */
  direction: string;
  /** ISO date (yyyy-mm-dd) shared by every message in the burst. */
  dateKey: string;
  messages: M[];
}

/**
 * Group an ASC-sorted message list into "bursts": runs of consecutive
 * messages with the same direction AND same calendar day. A new day
 * forces a new burst even when the direction is unchanged so that the
 * UI can render a date divider between them.
 */
export function groupMessagesIntoBursts<M extends ChatMessageLike>(
  messages: M[]
): MessageBurst<M>[] {
  const bursts: MessageBurst<M>[] = [];
  for (const m of messages) {
    const d = m.createdAt instanceof Date ? m.createdAt : new Date(m.createdAt);
    const dateKey = toDateKey(d);
    const last = bursts[bursts.length - 1];
    if (last && last.direction === m.direction && last.dateKey === dateKey) {
      last.messages.push(m);
    } else {
      bursts.push({ direction: m.direction, dateKey, messages: [m] });
    }
  }
  return bursts;
}

/** yyyy-mm-dd in local time. Used as a grouping key only — not for display. */
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const RU_MONTHS_GEN = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

/**
 * Russian, calendar-aware divider label.
 *   today -> "Сегодня"
 *   yesterday -> "Вчера"
 *   same year -> "12 мая"
 *   else -> "12 мая 2024"
 */
export function formatDateDividerLabel(date: Date, now: Date = new Date()): string {
  const dKey = toDateKey(date);
  const todayKey = toDateKey(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yKey = toDateKey(yesterday);

  if (dKey === todayKey) return "Сегодня";
  if (dKey === yKey) return "Вчера";

  const day = date.getDate();
  const month = RU_MONTHS_GEN[date.getMonth()];
  if (date.getFullYear() === now.getFullYear()) {
    return `${day} ${month}`;
  }
  return `${day} ${month} ${date.getFullYear()}`;
}

/**
 * "Источник" text for a bot-side message. Returns null when the message
 * doesn't warrant a pill (e.g. plain user inbound text).
 */
export interface SourcePillInput {
  direction: "in" | "out" | string;
  sourceType: string | null | undefined;
  sourceId: string | null | undefined;
  callbackData: string | null | undefined;
  flowName?: string | null;
  broadcastName?: string | null;
  nodeLabel?: string | null;
}

export interface SourcePillDescriptor {
  icon: string;
  label: string;
  tone: "info" | "neutral" | "success" | "warning";
}

export function describeSource(input: SourcePillInput): SourcePillDescriptor | null {
  if (input.direction === "in") {
    if (input.callbackData) {
      return {
        icon: "🔘",
        label: `кнопка: ${input.callbackData}`,
        tone: "info",
      };
    }
    return null;
  }
  // outbound
  switch (input.sourceType) {
    case "flow": {
      // sourceId for flows is encoded as "${flowId}:${nodeId}"
      const nodeId = input.sourceId ? input.sourceId.split(":")[1] ?? null : null;
      const flowName = input.flowName ?? "сценарий";
      const nodePart = input.nodeLabel || nodeId;
      return {
        icon: "🔀",
        label: nodePart ? `${flowName} → ${nodePart}` : flowName,
        tone: "info",
      };
    }
    case "broadcast":
      return {
        icon: "📨",
        label: input.broadcastName ?? "рассылка",
        tone: "success",
      };
    case "manual":
      return { icon: "✍️", label: "оператор", tone: "neutral" };
    case "trigger":
      return { icon: "▶️", label: "триггер", tone: "warning" };
    default:
      return null;
  }
}

/** Pull the unique flowId / broadcastId values referenced by a page. */
export function collectSourceRefs(
  messages: Array<{ sourceType?: string | null; sourceId?: string | null }>
): { flowIds: string[]; broadcastIds: string[] } {
  const flowIds = new Set<string>();
  const broadcastIds = new Set<string>();
  for (const m of messages) {
    if (!m.sourceId || !m.sourceType) continue;
    if (m.sourceType === "flow") {
      const flowId = m.sourceId.split(":")[0];
      if (flowId) flowIds.add(flowId);
    } else if (m.sourceType === "broadcast") {
      broadcastIds.add(m.sourceId);
    }
  }
  return { flowIds: Array.from(flowIds), broadcastIds: Array.from(broadcastIds) };
}
