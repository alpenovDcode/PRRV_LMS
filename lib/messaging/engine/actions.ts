/**
 * lib/messaging/engine/actions.ts
 *
 * Исполнитель inline-actions для узлов воронки.
 *
 * Action — это побочный эффект который выполняется после основного действия
 * узла. Через actions воронка:
 *   • Помечает подписчиков тегами (для сегментации)
 *   • Добавляет/убирает их из листов
 *   • Сохраняет переменные (в context или в subscriber)
 *   • Вызывает внешние API
 *
 * Без этого слоя воронка ничего не "запоминает" — становится бесполезной
 * для маркетинга и автоматизации.
 */

import { db } from "@/lib/db";
import type { MessagingBot, MessagingSubscriber } from "@prisma/client";
import { renderTemplate } from "./template";
import type { NodeAction } from "./graph-types";
import { recordEvent, EVENT_TYPES } from "../events";

export interface ExecuteActionsResult {
  /** Обновлённый subscriber (если actions меняли его поля) */
  subscriber: MessagingSubscriber;
  /** Обновлённый context (мог измениться через set_var scope:"context" или http_request) */
  context: Record<string, unknown>;
}

/**
 * Выполняет массив actions последовательно. Не падает на ошибке отдельного
 * action — логирует и продолжает (важно, чтобы http_request к 5xx-серверу
 * не ломал всю воронку).
 */
export async function executeActions(
  actions: NodeAction[],
  bot: MessagingBot,
  subscriber: MessagingSubscriber,
  context: Record<string, unknown>
): Promise<ExecuteActionsResult> {
  let currentSubscriber = subscriber;
  let currentContext = context;

  for (const action of actions) {
    try {
      const result = await executeAction(action, bot, currentSubscriber, currentContext);
      currentSubscriber = result.subscriber;
      currentContext = result.context;
    } catch (e) {
      console.error(`[actions] ${action.type} failed:`, e);
    }
  }

  return { subscriber: currentSubscriber, context: currentContext };
}

async function executeAction(
  action: NodeAction,
  bot: MessagingBot,
  subscriber: MessagingSubscriber,
  context: Record<string, unknown>
): Promise<ExecuteActionsResult> {
  const tmplCtx = { subscriber, bot, context };

  switch (action.type) {
    case "add_tag": {
      const tag = renderTemplate(action.tag, tmplCtx).trim();
      if (!tag) return { subscriber, context };
      if (subscriber.tags.includes(tag)) return { subscriber, context };

      const updated = await db.messagingSubscriber.update({
        where: { id: subscriber.id },
        data: { tags: { push: tag } },
      });
      await recordEvent({
        botId: bot.id,
        type: EVENT_TYPES.TAG_ADDED,
        subscriberId: subscriber.id,
        data: { tag },
      });
      return { subscriber: updated, context };
    }

    case "remove_tag": {
      const tag = renderTemplate(action.tag, tmplCtx).trim();
      if (!tag || !subscriber.tags.includes(tag)) return { subscriber, context };

      const updated = await db.messagingSubscriber.update({
        where: { id: subscriber.id },
        data: { tags: subscriber.tags.filter((t) => t !== tag) },
      });
      await recordEvent({
        botId: bot.id,
        type: EVENT_TYPES.TAG_REMOVED,
        subscriberId: subscriber.id,
        data: { tag },
      });
      return { subscriber: updated, context };
    }

    case "add_to_list": {
      // Идемпотентно: upsert на unique(listId, subscriberId)
      let created = false;
      await db.messagingListMember
        .upsert({
          where: {
            listId_subscriberId: {
              listId: action.listId,
              subscriberId: subscriber.id,
            },
          },
          create: {
            listId: action.listId,
            subscriberId: subscriber.id,
            source: "auto",
          },
          update: {}, // ничего, запись уже есть
        })
        .then(() => {
          created = true;
        })
        .catch((e) => {
          // листа может не быть — логируем
          console.warn(`[actions] add_to_list ${action.listId} failed:`, e);
        });

      // Пересчитаем memberCount (best-effort)
      await refreshListMemberCount(action.listId).catch(() => {});
      if (created) {
        await recordEvent({
          botId: bot.id,
          type: EVENT_TYPES.LIST_JOINED,
          subscriberId: subscriber.id,
          data: { listId: action.listId },
        });
      }
      return { subscriber, context };
    }

    case "remove_from_list": {
      const res = await db.messagingListMember
        .deleteMany({
          where: {
            listId: action.listId,
            subscriberId: subscriber.id,
          },
        })
        .catch(() => null);
      await refreshListMemberCount(action.listId).catch(() => {});
      if (res && res.count > 0) {
        await recordEvent({
          botId: bot.id,
          type: EVENT_TYPES.LIST_LEFT,
          subscriberId: subscriber.id,
          data: { listId: action.listId },
        });
      }
      return { subscriber, context };
    }

    case "set_var": {
      const value = renderTemplate(action.value, tmplCtx);
      const scope = action.scope ?? "context";

      if (scope === "context") {
        return { subscriber, context: { ...context, [action.key]: value } };
      }
      // subscriber-scope — пишем в subscriber.variables (long-lived)
      const newVars = {
        ...((subscriber.variables as Record<string, unknown>) ?? {}),
        [action.key]: value,
      };
      const updated = await db.messagingSubscriber.update({
        where: { id: subscriber.id },
        data: { variables: newVars as any },
      });
      return { subscriber: updated, context };
    }

    case "http_request": {
      const url = renderTemplate(action.url, tmplCtx);
      const body = action.body ? renderTemplate(action.body, tmplCtx) : undefined;
      const timeoutMs = (action.timeoutSec ?? 10) * 1000;

      try {
        const resp = await fetch(url, {
          method: action.method,
          headers: {
            "Content-Type": "application/json",
            ...(action.headers ?? {}),
          },
          body: body && action.method !== "GET" ? body : undefined,
          signal: AbortSignal.timeout(timeoutMs),
        });

        // Парсим JSON, если не получилось — кладём raw text
        let payload: unknown;
        const text = await resp.text();
        try {
          payload = JSON.parse(text);
        } catch {
          payload = text;
        }

        const key = action.saveResponseTo ?? "lastHttpResponse";
        return {
          subscriber,
          context: {
            ...context,
            [key]: payload,
            lastHttpStatus: resp.status,
          },
        };
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        return {
          subscriber,
          context: {
            ...context,
            lastHttpError: errMsg.slice(0, 200),
            lastHttpStatus: 0,
          },
        };
      }
    }
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────

async function refreshListMemberCount(listId: string): Promise<void> {
  const count = await db.messagingListMember.count({ where: { listId } });
  await db.messagingList.update({
    where: { id: listId },
    data: { memberCount: count },
  });
}
