/**
 * lib/messaging/event-catalog.ts
 *
 * Каталог типов событий MessagingEvent. Превращает «технические» строки
 * (вида `flow.failed`, `broadcast.delivered`) в человекочитаемые лейблы,
 * описания и severity. Используется страницей «Логи» MAX/мессенджер-бота.
 *
 * Источник types — `EVENT_TYPES` из `lib/messaging/events.ts`. Здесь — их
 * UI-метаданные. severity маршрутизирует событие в фильтр-чипы
 * «Ошибки / Предупреждения / Инфо / Debug».
 *
 * Если фронт встречает type, которого нет в каталоге, рендер падает в
 * fallback `info` с самим type как лейбл.
 */

export type EventSeverity = "error" | "warn" | "info" | "debug";

export interface EventMeta {
  /** Краткий лейбл для колонки в таблице (1-3 слова). */
  label: string;
  /** Развёрнутое описание для tooltip и раскрывающейся карточки. */
  description: string;
  /** Уровень — он же маршрутизирует в фильтр-чипы. */
  severity: EventSeverity;
  /** Иконка-эмодзи для быстрого скана глазами. */
  icon: string;
}

// ─── Errors ──────────────────────────────────────────────────────────────
const ERRORS: Record<string, EventMeta> = {
  "flow.failed": {
    label: "Сценарий упал",
    description:
      "Run завершился с ошибкой. Чаще всего — ссылка на несуществующую " +
      "ноду или невалидный JSON графа. Детали в data.error.",
    severity: "error",
    icon: "🔴",
  },
  "broadcast.failed": {
    label: "Рассылка упала",
    description:
      "Один из получателей рассылки не дошёл — провайдер вернул ошибку " +
      "после 3 повторных попыток. Код ошибки в data.error.",
    severity: "error",
    icon: "📡",
  },
};

// ─── Warnings ────────────────────────────────────────────────────────────
const WARNINGS: Record<string, EventMeta> = {
  "flow.cancelled": {
    label: "Сценарий отменён",
    description:
      "Run прерван — обычно админом через UI или замещён более свежим " +
      "запуском того же сценария. Не баг, но стоит знать.",
    severity: "warn",
    icon: "⏹️",
  },
};

// ─── Info — основной фон работы ──────────────────────────────────────────
const INFO: Record<string, EventMeta> = {
  "subscriber.created": {
    label: "Новый подписчик",
    description:
      "Зарегистрирован новый MessagingSubscriber. Источник в data.source — " +
      "/start, переход по smart-ссылке, импорт CSV, тестовый кружок.",
    severity: "info",
    icon: "👤",
  },
  "subscriber.lms_linked": {
    label: "Привязан LMS-юзер",
    description:
      "MessagingSubscriber матчнулся с User (по email/телефону или ручному " +
      "линку). Теперь триггеры по покупкам и доступ к курсам синхронны.",
    severity: "info",
    icon: "🔗",
  },
  "flow.started": {
    label: "Сценарий запущен",
    description:
      "Создан MessagingFlowRun. data.trigger показывает, что инициатор: " +
      "ключевое слово, /start, расписание, broadcast, ручной запуск.",
    severity: "info",
    icon: "▶️",
  },
  "flow.completed": {
    label: "Сценарий завершён",
    description: "Run дошёл до конца графа без ошибок.",
    severity: "info",
    icon: "✅",
  },
  "trigger.matched": {
    label: "Триггер сработал",
    description:
      "Входящее сообщение или событие совпало с триггером сценария. " +
      "data.triggerId и data.flowId показывают какие.",
    severity: "info",
    icon: "🎯",
  },
  "tag.added": {
    label: "Тег добавлен",
    description:
      "Подписчику добавлен тег — обычно inline-действием внутри ноды " +
      "или admin-API. data.tag — какой именно.",
    severity: "info",
    icon: "🏷️",
  },
  "tag.removed": {
    label: "Тег снят",
    description: "Обратное к tag.added.",
    severity: "info",
    icon: "🏷️",
  },
  "list.joined": {
    label: "Вступил в список",
    description: "Подписчик добавлен в MessagingList — для сегментации рассылок.",
    severity: "info",
    icon: "📋",
  },
  "list.left": {
    label: "Покинул список",
    description: "Подписчик удалён из MessagingList.",
    severity: "info",
    icon: "📋",
  },
  "broadcast.started": {
    label: "Рассылка запущена",
    description: "Broadcast перешёл в running, начали обходить получателей.",
    severity: "info",
    icon: "📡",
  },
  "broadcast.completed": {
    label: "Рассылка завершена",
    description: "Все получатели обработаны. Счётчики delivered/failed в data.",
    severity: "info",
    icon: "📡",
  },
  "broadcast.delivered": {
    label: "Сообщение доставлено",
    description: "Отдельный получатель рассылки получил сообщение. По умолчанию скрыто.",
    severity: "debug",
    icon: "📨",
  },
  "operator.takeover": {
    label: "Оператор взял диалог",
    description:
      "Admin вошёл в Inbox и нажал «Взять диалог» — auto-триггеры и flow-" +
      "engine для этого подписчика выключены до релиза.",
    severity: "info",
    icon: "🖐️",
  },
  "operator.release": {
    label: "Оператор вернул бота",
    description: "Диалог снова обслуживается автоматикой.",
    severity: "info",
    icon: "🤖",
  },
  "operator.replied": {
    label: "Ответ оператора",
    description: "Сообщение из Inbox отправлено вручную (не автоматикой).",
    severity: "info",
    icon: "💬",
  },
};

// ─── Debug — много, обычно скрыто по умолчанию ──────────────────────────
const DEBUG: Record<string, EventMeta> = {
  "message.inbound": {
    label: "Входящее",
    description:
      "Подписчик прислал сообщение. По умолчанию скрыто из логов — " +
      "иначе шум забивает важные события.",
    severity: "debug",
    icon: "📥",
  },
  "message.outbound": {
    label: "Исходящее",
    description: "Бот отправил сообщение. Скрыто по умолчанию.",
    severity: "debug",
    icon: "📤",
  },
};

export const EVENT_CATALOG: Record<string, EventMeta> = {
  ...ERRORS,
  ...WARNINGS,
  ...INFO,
  ...DEBUG,
};

/** Метаданные с fallback на info, если type неизвестен. */
export function getEventMeta(type: string): EventMeta {
  return (
    EVENT_CATALOG[type] ?? {
      label: type,
      description: "Тип события не описан в каталоге.",
      severity: "info",
      icon: "•",
    }
  );
}

/** Все type'ы конкретного уровня — для фильтра в API. */
export function eventTypesBySeverity(severity: EventSeverity): string[] {
  return Object.entries(EVENT_CATALOG)
    .filter(([, meta]) => meta.severity === severity)
    .map(([type]) => type);
}

export const SEVERITY_LABEL: Record<EventSeverity, string> = {
  error: "Ошибки",
  warn: "Предупреждения",
  info: "Инфо",
  debug: "Debug",
};
