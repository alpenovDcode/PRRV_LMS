/**
 * lib/messaging/engine/template.ts
 *
 * Простой шаблонизатор {{subscriber.username}}, {{context.foo}}, etc.
 * Если переменная не найдена — заменяется на "" (как в SaleBot).
 *
 * Поддерживаемые namespace'ы:
 *   subscriber.* — поля MessagingSubscriber
 *   context.*    — переменные накопленные в FlowRun.context
 *   bot.*        — поля MessagingBot
 *   now          — текущее время в формате DD.MM.YYYY HH:mm
 */

import type { MessagingBot, MessagingSubscriber } from "@prisma/client";

export interface TemplateContext {
  subscriber: MessagingSubscriber;
  bot: MessagingBot;
  context: Record<string, unknown>;
}

const TEMPLATE_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

export function renderTemplate(template: string, ctx: TemplateContext): string {
  return template.replace(TEMPLATE_RE, (_match, path: string) => {
    const value = resolve(path, ctx);
    return value == null ? "" : String(value);
  });
}

function resolve(path: string, ctx: TemplateContext): unknown {
  const [ns, ...rest] = path.split(".");
  const key = rest.join(".");

  switch (ns) {
    case "subscriber": {
      const s: any = ctx.subscriber;
      // вложенные variables / customFields могут содержать произвольные ключи
      if (key && key in s) return s[key];
      const vars = s.variables as Record<string, unknown> | undefined;
      if (key && vars && key in vars) return vars[key];
      return undefined;
    }
    case "context":
      return key.split(".").reduce<any>((acc, k) => (acc ? acc[k] : undefined), ctx.context);
    case "bot": {
      const b: any = ctx.bot;
      return key && key in b ? b[key] : undefined;
    }
    case "now":
      return new Date().toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    default:
      return undefined;
  }
}
