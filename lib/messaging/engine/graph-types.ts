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

/** Отправить текст и сразу перейти на next. */
export interface SendTextNode {
  type: "send_text";
  /** Текст с шаблонами вида {{subscriber.username}} */
  text: string;
  next: string | null;
}

/** Отправить текст + quick replies. После клика payload → запишется в context.lastPayload. */
export interface SendQuickRepliesNode {
  type: "send_quick_replies";
  text: string;
  buttons: Array<{ title: string; payload: string }>;
  /** Куда идти если канал не поддерживает quick replies (для IG не используется) */
  next: string | null;
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
}

/** Записать значение в context (для логики или для использования в шаблонах). */
export interface SetVariableNode {
  type: "set_variable";
  key: string;
  /** Значение или шаблон {{...}} */
  value: string;
  next: string | null;
}

/** Конец воронки. */
export interface EndNode {
  type: "end";
}
