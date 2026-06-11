// Каталог событий движка. Превращает технические event-type строки
// (вида "flow.failed", "message.send_failed") в человекочитаемые
// русские лейблы, развёрнутые описания и severity-уровень.
//
// Используется UI-страницей «Логи» и любыми другими местами, которые
// показывают админу историю работы бота. severity маршрутизирует
// событие в фильтр «Ошибки / Предупреждения / Инфо».

export type EventSeverity = "error" | "warn" | "info" | "debug";

export interface EventMeta {
  // Краткий лейбл для таблицы (1-3 слова)
  label: string;
  // Развёрнутое описание — что произошло и почему это важно. Показывается
  // в подсказке-tooltip-е и в раскрывающейся карточке.
  description: string;
  // Уровень. error/warn двигают админа к действию, info — фон, debug —
  // совсем шум, скрывается по умолчанию.
  severity: EventSeverity;
  // Иконка-эмодзи для быстрого сканирования таблицы глазами.
  icon: string;
}

// ============================================================
// Errors — что-то сломалось, требует внимания админа
// ============================================================

const ERRORS: Record<string, EventMeta> = {
  "flow.failed": {
    label: "Сценарий упал",
    description:
      "Run завершился с ошибкой. Чаще всего — ссылка на несуществующую ноду " +
      "или невалидный JSON графа. Детали в properties.error.",
    severity: "error",
    icon: "🔴",
  },
  "message.send_failed": {
    label: "Сообщение не отправлено",
    description:
      "Telegram отверг исходящее сообщение. См. properties.errorCode и " +
      "properties.description — там точная причина (400 — невалидный HTML, " +
      "403 — пользователь заблокировал, 429 — rate-limit, etc.).",
    severity: "error",
    icon: "📤",
  },
  "broadcast.failed": {
    label: "Рассылка упала",
    description:
      "Один из получателей рассылки не дошёл. После 3 повторных попыток " +
      "помечается как failed. Свой код ошибки в properties.",
    severity: "error",
    icon: "📡",
  },
  "inline_action.error": {
    label: "Inline-действие упало",
    description:
      "Атомарная операция внутри onSend/onSave/onClick (тег/переменная/" +
      "список) выбросила исключение. Сама нода НЕ падает — мы идём " +
      "дальше, но запись не применилась. properties.op указывает, какая.",
    severity: "error",
    icon: "⚡",
  },
  "http_request.failed": {
    label: "HTTP-запрос не прошёл",
    description:
      "Внешний эндпоинт вернул ошибку (или таймаут). Если у ноды есть " +
      "onError — флоу пойдёт туда. Иначе run помечен failed.",
    severity: "error",
    icon: "🌐",
  },
  "bitrix.sync_failed": {
    label: "Bitrix24: синк упал",
    description:
      "Не удалось создать/обновить контакт или сделку в Bitrix24. Точная " +
      "причина в properties.error (неверный webhook, нет прав CRM, кривое " +
      "поле UF_CRM_* и т.п.). Тег подписчику проставлен, но в CRM не уехало.",
    severity: "error",
    icon: "🟦",
  },
  "validation.bad_regex": {
    label: "Кривой regex в валидации",
    description:
      "Шаблон валидации в wait_reply не компилируется. Валидатор " +
      "fail-open — пропускает всё. Поправь regex.",
    severity: "error",
    icon: "🧪",
  },
  "token_decrypt.failed": {
    label: "Не расшифровать токен",
    description:
      "AES-GCM расшифровка токена бота упала. Чаще всего — ротировали " +
      "TG_TOKEN_ENC_KEY без миграции. Бот мёртв до фикса env.",
    severity: "error",
    icon: "🔑",
  },
  "webhook.invalid_secret": {
    label: "Невалидный webhook-secret",
    description:
      "Telegram прислал webhook с неправильным X-Telegram-Bot-Api-Secret-" +
      "Token. Возможно попытка подделки или вы пересоздавали бота без " +
      "обновления вебхука.",
    severity: "error",
    icon: "🛡",
  },
  "flow.node_not_found": {
    label: "Нода не найдена",
    description:
      "В графе ссылка на несуществующий node id. Граф рассинхронизировался " +
      "при правке через JSON.",
    severity: "error",
    icon: "🔍",
  },
};

// ============================================================
// Warnings — поведение нештатное, но не критичное
// ============================================================

const WARNINGS: Record<string, EventMeta> = {
  "subscriber.blocked_bot": {
    label: "Юзер заблокировал бота",
    description:
      "Telegram вернул 403 на отправку или прислал my_chat_member со " +
      "статусом kicked. Подписчик помечен isBlocked=true, все его " +
      "активные runs отменены. Бот больше не сможет ему писать.",
    severity: "warn",
    icon: "🚫",
  },
  "flow.wait_reply_invalid": {
    label: "Ответ не прошёл валидацию",
    description:
      "Юзер прислал текст, который не сматчился с regex-валидацией " +
      "wait_reply. Run пошёл по onInvalidNext или остался parked.",
    severity: "warn",
    icon: "❌",
  },
  "flow.position_runs_cancelled": {
    label: "Дожимы отменены",
    description:
      "Юзер перешёл в новую позицию воронки, и его запланированные runs " +
      "(дожимы) из старой позиции автоматически отменились. Это " +
      "нормальное поведение position-модели.",
    severity: "info",
    icon: "♻️",
  },
  "redirect.expired": {
    label: "Просроченный redirect",
    description:
      "Юзер тапнул /r/<slug>, у которого истёк expiresAt. Получил 410.",
    severity: "warn",
    icon: "⏰",
  },
};

// ============================================================
// Info — нормальная работа
// ============================================================

const INFO: Record<string, EventMeta> = {
  "subscriber.created": {
    label: "Новый подписчик",
    description: "Юзер впервые написал боту.",
    severity: "info",
    icon: "🆕",
  },
  "subscriber.unblocked_bot": {
    label: "Юзер разблокировал бота",
    description: "Подписчик снова доступен для рассылок.",
    severity: "info",
    icon: "🔓",
  },
  "subscriber.tag_added": {
    label: "Добавлен тег",
    description: "На подписчика повешен тег. properties.tag — какой.",
    severity: "info",
    icon: "🏷",
  },
  "subscriber.tag_removed": {
    label: "Снят тег",
    description: "С подписчика снят тег.",
    severity: "info",
    icon: "🏷",
  },
  "subscriber.list_joined": {
    label: "Добавлен в список",
    description:
      "Подписчик попал в TgList. properties.listId — идентификатор списка.",
    severity: "info",
    icon: "📂",
  },
  "subscriber.list_left": {
    label: "Удалён из списка",
    description: "Подписчик удалён из TgList.",
    severity: "info",
    icon: "📂",
  },
  "subscriber.variable_set": {
    label: "Записана переменная",
    description:
      "Изменилось значение переменной подписчика. properties.scope/key/value.",
    severity: "info",
    icon: "📝",
  },
  "subscriber.contact_received": {
    label: "Получен контакт",
    description:
      "Юзер поделился телефоном через reply-keyboard. Номер сохранён в " +
      "client.phone.",
    severity: "info",
    icon: "📞",
  },
  "subscriber.location_received": {
    label: "Получена геолокация",
    description:
      "Юзер поделился координатами. Сохранены в client.location_lat/_lon.",
    severity: "info",
    icon: "📍",
  },
  "message.sent": {
    label: "Сообщение отправлено",
    description:
      "Бот успешно отправил сообщение. Источник в properties.sourceType.",
    severity: "info",
    icon: "✈",
  },
  "message.received": {
    label: "Сообщение получено",
    description: "Юзер прислал сообщение.",
    severity: "info",
    icon: "📥",
  },
  "button.clicked": {
    label: "Клик по кнопке",
    description:
      "Юзер тапнул callback-кнопку. properties.callbackData — что было нажато.",
    severity: "info",
    icon: "🖱",
  },
  "link.clicked": {
    label: "Клик по UTM-ссылке",
    description:
      "Юзер пришёл из tracking-link. properties.slug — какой именно.",
    severity: "info",
    icon: "🔗",
  },
  "channel.joined": {
    label: "Вступил в канал",
    description:
      "Юзер вступил в один из подключённых каналов (бот = админ). " +
      "properties.channelId — какой канал, properties.inviteLinkName — " +
      "через какую трекинг-ссылку (если есть).",
    severity: "info",
    icon: "📢",
  },
  "channel.left": {
    label: "Вышел из канала",
    description:
      "Юзер покинул канал или был выгнан админом. properties.kicked = " +
      "true, если выгнали; false, если ушёл сам.",
    severity: "info",
    icon: "📤",
  },
  "channel.join_requested": {
    label: "Заявка на вступление",
    description:
      "Юзер подал заявку на вступление в канал с включённой модерацией. " +
      "Одобрение/отклонение прилетит отдельным channel.joined / channel.left.",
    severity: "info",
    icon: "✋",
  },
  "redirect.clicked": {
    label: "Клик по трекинг-кнопке",
    description:
      "Юзер тапнул URL-кнопку, которая прошла через /r/<slug> редирект.",
    severity: "info",
    icon: "↗",
  },
  "flow.entered": {
    label: "Сценарий запущен",
    description:
      "Новый run воронки. properties.triggerType — что запустило (command, " +
      "keyword, tag_added и т.д.).",
    severity: "info",
    icon: "▶",
  },
  "flow.completed": {
    label: "Сценарий завершён",
    description: "Run дошёл до end-ноды.",
    severity: "info",
    icon: "✅",
  },
  "flow.node_executed": {
    label: "Выполнена нода",
    description:
      "Очень частое событие — для каждого шага run-а. По умолчанию скрыто " +
      "(debug-уровень). Включи фильтр «Отладка», чтобы видеть.",
    severity: "debug",
    icon: "·",
  },
  "flow.position_entered": {
    label: "Новая позиция",
    description:
      "Подписчик вошёл в позиционную ноду (Step). Обновлён " +
      "currentPositionNodeId.",
    severity: "info",
    icon: "📍",
  },
  "media.captured": {
    label: "Медиа в библиотеке",
    description:
      "Админ кинул файл боту → file_id сохранён. Теперь доступно в редакторе.",
    severity: "info",
    icon: "🖼",
  },
  "broadcast.started": {
    label: "Рассылка стартовала",
    description: "Запустился worker, начинает слать получателям.",
    severity: "info",
    icon: "📡",
  },
  "broadcast.delivered": {
    label: "Сообщение доставлено",
    description: "Один из получателей рассылки получил сообщение.",
    severity: "info",
    icon: "📨",
  },
  "broadcast.finished": {
    label: "Рассылка завершена",
    description: "Все получатели обработаны (доставлены/упали/заблочены).",
    severity: "info",
    icon: "🏁",
  },
  "bitrix.sync_ok": {
    label: "Bitrix24: сделка создана/обновлена",
    description:
      "Тег-триггер сработал, контакт и сделка успешно синхронизированы. " +
      "ID в properties.dealId / properties.contactId.",
    severity: "info",
    icon: "🟦",
  },
  "bitrix.sync_skipped": {
    label: "Bitrix24: синк пропущен",
    description:
      "Тег добавлен, но синк не запущен. properties.reason: disabled — " +
      "интеграция выключена; no_trigger — для этого тега нет тег-триггера; " +
      "no_webhook — не задан webhook URL.",
    severity: "debug",
    icon: "🟦",
  },
};

export const EVENT_CATALOG: Record<string, EventMeta> = {
  ...ERRORS,
  ...WARNINGS,
  ...INFO,
};

// Fallback для неизвестных типов событий — отображаем «как есть», но
// угадываем severity из имени.
function fallbackMeta(type: string): EventMeta {
  const lower = type.toLowerCase();
  let severity: EventSeverity = "info";
  let icon = "·";
  if (lower.includes("fail") || lower.includes("error") || lower.endsWith(".bad")) {
    severity = "error";
    icon = "🔴";
  } else if (lower.includes("invalid") || lower.includes("warn") || lower.includes("blocked")) {
    severity = "warn";
    icon = "⚠";
  }
  return { label: type, description: "Неизвестный тип события", severity, icon };
}

export function getEventMeta(type: string): EventMeta {
  return EVENT_CATALOG[type] ?? fallbackMeta(type);
}

// Группировка типов по severity — для отдачи в UI как фильтр-чипы.
export function eventTypesBySeverity(severity: EventSeverity): string[] {
  return Object.entries(EVENT_CATALOG)
    .filter(([_, meta]) => meta.severity === severity)
    .map(([type]) => type);
}
