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

/** Условный переход по ответу подписчика (context.lastInput / lastPayload). */
export interface ConditionNode {
  type: "condition";
  /**
   * Правила матчинга. Первое сработавшее = выбранная ветка.
   * Если ни одно не сработало — onNoMatch.
   */
  branches: Array<{
    /** Какое поле проверяем: lastInput (текст) | lastPayload (от quick reply) */
    field: "lastInput" | "lastPayload";
    /** Как сравнивать */
    match: "exact" | "contains" | "regex" | "starts_with";
    /** Значение/паттерн */
    value: string;
    caseSensitive?: boolean;
    /** Куда переходить если совпало */
    next: string | null;
  }>;
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
