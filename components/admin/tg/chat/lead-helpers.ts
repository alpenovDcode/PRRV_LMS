// Общие хелперы карточки лида — формат времени, человекочитаемые
// описания событий, бейджи статусов. Используются вкладками
// «История» и «Маркетинг» (lead-history / lead-marketing).

export function formatAbsolute(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relativeFromNow(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.round(diff / 1000);
  if (s < 60) return "только что";
  if (s < 3600) return `${Math.round(s / 60)} мин назад`;
  if (s < 86400) return `${Math.round(s / 3600)} ч назад`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)} дн назад`;
  return new Date(iso).toLocaleDateString("ru-RU");
}

// Длительность run'а в человекочитаемом виде: «2 мин», «3 ч», «5 дн».
export function formatDuration(sec: number | null): string {
  if (sec == null) return "—";
  if (sec < 60) return `${sec} с`;
  if (sec < 3600) return `${Math.round(sec / 60)} мин`;
  if (sec < 86400) return `${Math.round(sec / 3600)} ч`;
  return `${Math.round(sec / 86400)} дн`;
}

// Бейдж-вариант по статусу run'а / доставки рассылки.
export function statusBadgeVariant(
  s: string
): "default" | "secondary" | "destructive" {
  if (s === "completed" || s === "sent" || s === "delivered") return "default";
  if (s === "failed" || s === "blocked") return "destructive";
  return "secondary";
}

// Иконка-эмодзи + человекочитаемое описание события таймлайна.
export interface TimelineEvent {
  id: string;
  type: string;
  properties: Record<string, unknown>;
  occurredAt: string;
}

export function describeEvent(ev: {
  type: string;
  properties: Record<string, unknown> | null;
}): { icon: string; text: string } {
  const p = ev.properties ?? {};
  const get = (k: string) => (p[k] === undefined || p[k] === null ? "" : String(p[k]));
  switch (ev.type) {
    case "subscriber.created":
      return { icon: "🎉", text: `Подписался${get("source") ? ` (${get("source")})` : ""}` };
    case "subscriber.tag_added":
      return { icon: "🏷️", text: `Добавлен тег «${get("tag")}»` };
    case "subscriber.tag_removed":
      return { icon: "🏷️", text: `Снят тег «${get("tag")}»` };
    case "subscriber.list_joined":
      return { icon: "📋", text: `Добавлен в список «${get("listName") || get("listId")}»` };
    case "subscriber.list_left":
      return { icon: "📋", text: `Удалён из списка «${get("listName") || get("listId")}»` };
    case "subscriber.variable_set":
      return { icon: "📝", text: `Переменная ${get("key")} = ${get("value")}` };
    case "subscriber.contact_received":
      return { icon: "📞", text: `Поделился телефоном` };
    case "subscriber.location_received":
      return { icon: "📍", text: `Поделился геолокацией` };
    case "subscriber.blocked_bot":
      return { icon: "🚫", text: `Заблокировал бота` };
    case "subscriber.unblocked_bot":
      return { icon: "✅", text: `Разблокировал бота` };
    case "flow.entered":
      return { icon: "▶️", text: `Запуск сценария (${get("triggerType") || "trigger"})` };
    case "flow.completed":
      return { icon: "🏁", text: `Завершил сценарий` };
    case "flow.failed":
      return { icon: "⚠️", text: `Сценарий упал: ${get("error") || get("lastError")}` };
    case "flow.node_executed":
      return { icon: "↳", text: `Шаг ${get("nodeType")}` };
    case "flow.ab_split":
      return { icon: "🎲", text: `A/B: вариант «${get("variant")}»` };
    case "flow.position_entered":
      return { icon: "📌", text: `Позиция в воронке обновлена` };
    case "button.clicked":
      return { icon: "🔘", text: `Клик кнопки: ${get("callbackData")}` };
    case "message.received":
      return { icon: "←", text: `Входящее сообщение` };
    case "message.sent":
      return { icon: "→", text: `Отправлено сообщение` };
    case "message.send_failed":
      return { icon: "⚠️", text: `Не доставлено: ${get("description") || get("errorCode")}` };
    case "redirect.clicked":
    case "link.clicked":
      return { icon: "🔗", text: `Клик по ссылке ${get("slug")}` };
    case "broadcast.delivered":
      return { icon: "📨", text: `Получил рассылку` };
    case "broadcast.failed":
      return { icon: "📭", text: `Рассылка не доставлена` };
    case "scheduled_flow.completed":
      return { icon: "⏰", text: `Запущен по расписанию` };
    case "media.captured":
      return { icon: "🖼️", text: `Захвачено медиа` };
    default:
      return { icon: "•", text: ev.type };
  }
}

// Форма ответа GET /subscribers/[id]/dossier. Общая для вкладок
// «История» и «Маркетинг» — оба компонента дёргают один и тот же
// queryKey, react-query дедуплицирует запрос.
export interface DossierData {
  identity: {
    chatId: string;
    tgUserId: string;
    languageCode: string | null;
    isBlocked: boolean;
    subscribedAt: string;
    unsubscribedAt: string | null;
  };
  customFields: Record<string, unknown>;
  position: {
    flowId: string;
    flowName: string;
    nodeId: string | null;
    at: string | null;
  } | null;
  conversion: {
    started: number;
    completed: number;
    failed: number;
    cancelled: number;
    conversionRate: number;
  };
  flowRuns: Array<{
    id: string;
    flowId: string;
    flowName: string;
    status: string;
    currentNodeId: string | null;
    startedAt: string;
    finishedAt: string | null;
    durationSec: number | null;
    lastError: string | null;
  }>;
  events: TimelineEvent[];
  broadcasts: Array<{
    id: string;
    status: string;
    sentAt: string | null;
    errorMessage: string | null;
    broadcastId: string;
    broadcastName: string;
  }>;
  stats: { messagesIn: number; messagesOut: number; buttonClicks: number };
  touches: {
    first: TouchInfo | null;
    last: TouchInfo | null;
  };
}

export interface TouchInfo {
  slug: string;
  at: string | null;
  link: {
    slug: string;
    name: string;
    utm: Record<string, string>;
  } | null;
}

// Человекочитаемый статус run'а на русском.
export function flowRunStatusLabel(s: string): string {
  switch (s) {
    case "completed": return "завершён";
    case "failed": return "ошибка";
    case "cancelled": return "отменён";
    case "running": return "выполняется";
    case "queued": return "в очереди";
    case "sleeping": return "ожидает (delay)";
    case "waiting_reply": return "ждёт ответа";
    default: return s;
  }
}
