/**
 * lib/messaging/engine/graph-types.ts
 *
 * Типы графа воронки. Хранится в MessagingFlow.graph как JSON.
 *
 * Граф = словарь узлов + ID стартового узла. Узлы ссылаются на соседей по ID.
 * Линейный execution: engine читает текущий узел из FlowRun.currentNodeId,
 * выполняет, переходит на next.
 */

export interface FlowGraph {
  startNodeId: string;
  nodes: Record<string, FlowNode>;
}

export type FlowNode =
  | SendTextNode
  | SendQuickRepliesNode
  | SendButtonsNode
  | WaitReplyNode
  | ConditionNode
  | SetVariableNode
  | DelayNode
  | GotoFlowNode
  | HttpRequestNode
  | EndNode;

// ─── Inline-actions ────────────────────────────────────────────────────────
//
// Action — это побочный эффект который выполняется ПОСЛЕ основного действия
// узла, но ДО перехода на next. Можно вешать массив actions[] на любой узел.
//
// Примеры:
//   send_text + add_tag "lead"           — после отправки помечаем подписчика
//   wait_reply + set_var "answered"=true — после получения ответа сохраняем
//   condition + add_to_list "vip"        — после ветвления попадаем в список
//
// Это аналог inline-actions в Telegram-движке. Без них воронка ничего не
// накапливает в БД и не интегрируется с broadcast'ами/Bitrix.

export type NodeAction =
  | AddTagAction
  | RemoveTagAction
  | AddToListAction
  | RemoveFromListAction
  | SetVarAction
  | HttpRequestAction;

export interface AddTagAction {
  type: "add_tag";
  /** Имя тега (поддерживает шаблоны вида {{context.x}}) */
  tag: string;
}

export interface RemoveTagAction {
  type: "remove_tag";
  tag: string;
}

export interface AddToListAction {
  type: "add_to_list";
  /** ID списка (MessagingList.id) */
  listId: string;
}

export interface RemoveFromListAction {
  type: "remove_from_list";
  listId: string;
}

export interface SetVarAction {
  type: "set_var";
  /** Имя переменной */
  key: string;
  /** Значение или шаблон {{...}} */
  value: string;
  /**
   * Куда писать:
   *   "context"     — context конкретного run'а (исчезает после end)
   *   "subscriber"  — subscriber.variables (живёт долго, доступно через
   *                   {{subscriber.variables.X}} в любых будущих воронках)
   */
  scope?: "context" | "subscriber";
}

export interface HttpRequestAction {
  type: "http_request";
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** URL с поддержкой шаблонов */
  url: string;
  /** JSON-тело (для POST/PUT/PATCH). С шаблонами. */
  body?: string;
  /** Опциональные хедеры — для аутентификации внешнего API */
  headers?: Record<string, string>;
  /**
   * Куда сохранить распарсенный JSON-ответ. По умолчанию context.lastHttpResponse.
   * Используется в следующих узлах через {{context.lastHttpResponse.field}}.
   */
  saveResponseTo?: string;
  /** Таймаут запроса в секундах. По умолчанию 10. */
  timeoutSec?: number;
}

// ─── Узлы-расширения с actions ─────────────────────────────────────────────
//
// TypeScript не даёт декларировать optional поле на discriminated union в
// одном месте, поэтому actions[] добавляется к каждому типу узла отдельно.
// (Каждый интерфейс ниже уже имеет actions через intersection в runner —
// см. lib/messaging/engine/runner.ts → executeActions.)

/** Отправить текст и сразу перейти на next. */
export interface SendTextNode {
  type: "send_text";
  /** Текст с шаблонами вида {{subscriber.username}} */
  text: string;
  next: string | null;
  actions?: NodeAction[];
}

/** Отправить текст + quick replies. После клика payload → запишется в context.lastPayload. */
export interface SendQuickRepliesNode {
  type: "send_quick_replies";
  text: string;
  buttons: Array<{ title: string; payload: string }>;
  /** Куда идти если канал не поддерживает quick replies (для IG не используется) */
  next: string | null;
  actions?: NodeAction[];
}

/**
 * Отправить текст + кнопки-карточки. В отличие от quick replies кнопки
 * могут быть `url` (открывают сайт) или `postback` (отправляют payload).
 *
 * Лимиты для IG: до 3 кнопок, текст ≤ 640 chars, title кнопки ≤ 20 chars.
 */
export interface SendButtonsNode {
  type: "send_buttons";
  text: string;
  buttons: Array<
    | { type: "url"; title: string; url: string }
    | { type: "postback"; title: string; payload: string }
  >;
  next: string | null;
  actions?: NodeAction[];
}

/** Ждать ответ от подписчика. По истечении timeout — onTimeout (или сразу complete если null). */
export interface WaitReplyNode {
  type: "wait_reply";
  /** Сколько секунд ждать. По умолчанию 86400 (24ч). */
  timeoutSec: number;
  /** Куда переходить после получения любого ответа */
  onReply: string | null;
  /** Куда переходить если timeout (null = end) */
  onTimeout: string | null;
  /** Actions выполняются ПОСЛЕ получения ответа (перед переходом на onReply). */
  actions?: NodeAction[];
}

/**
 * Условный переход. Сравнивает значения из контекста (lastInput,
 * lastPayload и произвольные переменные) с константами/шаблонами.
 *
 * Сложные условия (SaleBot-аналог `var != 1 and var != ""`) выражаются
 * через массив `clauses` внутри ветки + `join: "and" | "or"`. Между
 * ветками — всегда OR (первая сработавшая = выбранная).
 *
 * Backward-compat: старый формат с одним `field/match/value` на ветке
 * тоже понимается (оборачивается в одно clause при выполнении).
 */
export type ConditionField = "lastInput" | "lastPayload" | "variable";
export type ConditionOperator =
  | "eq" // ==
  | "neq" // !=
  | "contains"
  | "starts_with"
  | "regex"
  | "is_empty" // value игнорируется
  | "is_not_empty"
  | "gt" // числовое >
  | "lt" // числовое <
  | "gte"
  | "lte";

export interface ConditionClause {
  field: ConditionField;
  /** Имя переменной в context (для field=variable). */
  variable?: string;
  operator: ConditionOperator;
  /** Шаблон ({{...}}) или константа. Для is_empty/is_not_empty не нужен. */
  value?: string;
  caseSensitive?: boolean;
}

export interface ConditionBranch {
  /** Новый формат — массив условий объединённых через `join`. */
  clauses?: ConditionClause[];
  /** Логическое объединение clauses. Дефолт "and". */
  join?: "and" | "or";
  /** Старый формат (одно условие на ветке) — для backward-compat. */
  field?: "lastInput" | "lastPayload";
  match?: "exact" | "contains" | "regex" | "starts_with";
  value?: string;
  caseSensitive?: boolean;
  /** Куда переходить, если ветка сработала. */
  next: string | null;
}

export interface ConditionNode {
  type: "condition";
  /** Первая сработавшая ветка = выбранная. OR между ветками. */
  branches: ConditionBranch[];
  onNoMatch: string | null;
  actions?: NodeAction[];
}

/** Записать значение в context (для логики или для использования в шаблонах). */
export interface SetVariableNode {
  type: "set_variable";
  key: string;
  /** Значение или шаблон {{...}} */
  value: string;
  next: string | null;
  actions?: NodeAction[];
}

/** Конец воронки. */
export interface EndNode {
  type: "end";
  actions?: NodeAction[];
}

/**
 * Отложить выполнение на N секунд. Run переходит в sleeping,
 * waitUntil выставляется, cron позже возобновляет.
 *
 * Максимум 90 дней (7,776,000 сек) — больше не имеет смысла, и Postgres
 * timestamp не сломается.
 *
 * `quietHours` — SaleBot-аналог «shift_to_next_day»: если расчётное
 * время отправки попадает в «тихий период» (по умолчанию 22:00–08:00
 * по Москве), отложить до конца окна. Полезно для длинных автоворонок,
 * где иначе сообщения летят в 3 часа ночи и убивают engagement.
 */
export interface QuietHours {
  /** Начало окна, час 0–23 (по timeZone). */
  fromHour: number;
  /** Конец окна, час 0–23. Можно меньше fromHour (через полночь). */
  toHour: number;
  /** IANA timezone, например "Europe/Moscow". Дефолт "Europe/Moscow". */
  timeZone?: string;
}

export interface DelayNode {
  type: "delay";
  /** На сколько отложить (секунды). Минимум 60 (1 мин), максимум 7776000 (90 дней). */
  seconds: number;
  next: string | null;
  actions?: NodeAction[];
  /**
   * Если задано — расчётное `now+seconds` сдвигается до конца этого
   * окна, если в него попадает. SaleBot shift_to_next_day = fromHour:22
   * toHour:8 в Europe/Moscow.
   */
  quietHours?: QuietHours;
}

/**
 * Переход на другую воронку. Текущий run завершается (status=completed),
 * стартует новый run по указанной flow.
 */
export interface GotoFlowNode {
  type: "goto_flow";
  /** ID целевого MessagingFlow. Должен принадлежать тому же боту. */
  flowId: string;
  actions?: NodeAction[];
}

/**
 * Самостоятельный узел HTTP-запроса. То же что http_request action, но как
 * отдельный узел — удобно ставить в граф между сообщениями.
 *
 * Если нужен HTTP «попутно» к сообщению — лучше action, не узел.
 */
export interface HttpRequestNode {
  type: "http_request_node";
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  body?: string;
  headers?: Record<string, string>;
  saveResponseTo?: string;
  timeoutSec?: number;
  next: string | null;
  actions?: NodeAction[];
}
