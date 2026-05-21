// Формат портативного экспорта флоу. Это «архив», который можно:
//   • скачать как .json для бэкапа
//   • загрузить в другой бот (между ботами один и тот же набор шаблонов)
//   • опубликовать как шаблон в TEMPLATE_FLOWS (через копи-паст в код)
//
// Что мы НЕ переносим автоматически:
//   • file_id медиа — они привязаны к конкретному боту в Telegram
//     (бот A не сможет переслать file_id из бота B). При импорте
//     показываем предупреждение: «X вложений переехало с file_id, в
//     новом боте загрузите медиа заново и обновите fileId»
//   • listIds — ID listов локальны для бота. При импорте они вылетят
//     в warnings; админ должен переподключить вручную.
//   • flowIds в goto_flow — те же, ID привязаны к одному боту.
//   • customField keys — определения полей у каждого бота свои; ключи
//     не валидируются на стороне импорта, просто переносятся как есть.

import { z } from "zod";
import { flowGraphSchema, triggersSchema } from "./flow-schema";
import type { FlowGraph, FlowTrigger } from "./flow-schema";

export const FLOW_EXPORT_VERSION = 1;

export const flowExportSchema = z.object({
  // Защита от загрузки чужих форматов (вдруг кто-то засунет туда
  // SaleBot-экспорт). Внутри одного major-version обратно совместимы.
  formatVersion: z.literal(1),
  // Метаданные, чисто для человека — на импорт не влияют.
  exportedAt: z.string(),
  sourceBotUsername: z.string().optional(),
  sourceFlowId: z.string().optional(),
  // Содержимое.
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  graph: flowGraphSchema,
  triggers: triggersSchema,
});

export type FlowExport = z.infer<typeof flowExportSchema>;

export interface BuildExportArgs {
  name: string;
  description: string | null;
  graph: FlowGraph;
  triggers: FlowTrigger[];
  sourceBotUsername?: string;
  sourceFlowId?: string;
}

export function buildFlowExport(args: BuildExportArgs): FlowExport {
  return {
    formatVersion: FLOW_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    sourceBotUsername: args.sourceBotUsername,
    sourceFlowId: args.sourceFlowId,
    name: args.name,
    description: args.description ?? null,
    graph: args.graph,
    triggers: args.triggers,
  };
}

// Анализ потенциальных проблем при импорте в новый бот. НЕ блокирует
// импорт — это warnings для админа.
export interface ImportWarning {
  code:
    | "MEDIA_FILE_ID"
    | "GOTO_FLOW_ID"
    | "LIST_ID"
    | "ACTION_LIST_ID"
    | "TRIGGER_TRACKING_LINK";
  nodeId: string | null;
  message: string;
}

export function analyzeImportWarnings(exp: FlowExport): ImportWarning[] {
  const warnings: ImportWarning[] = [];
  for (const node of exp.graph.nodes) {
    if (node.type === "message") {
      const atts = node.payload.attachments ?? [];
      if (atts.some((a) => !!a.fileId)) {
        warnings.push({
          code: "MEDIA_FILE_ID",
          nodeId: node.id,
          message:
            "У сообщения есть медиа с file_id — file_id привязан к боту, в новом боте загрузите медиа заново.",
        });
      }
    }
    if (node.type === "goto_flow") {
      warnings.push({
        code: "GOTO_FLOW_ID",
        nodeId: node.id,
        message: `goto_flow указывает на флоу «${node.flowId}» — этот ID локален для исходного бота. Откройте ноду и выберите целевой флоу заново.`,
      });
    }
    // Inline-actions могут ссылаться на listIds.
    type ActionsBag = {
      addToLists?: string[];
      removeFromLists?: string[];
    };
    const bags: ActionsBag[] = [];
    if (node.type === "message") {
      if (node.payload.onSend) bags.push(node.payload.onSend as ActionsBag);
      for (const row of node.payload.buttonRows ?? []) {
        for (const btn of row) {
          if (btn.onClick) bags.push(btn.onClick as ActionsBag);
        }
      }
    }
    if (node.type === "wait_reply" && node.onSave) {
      bags.push(node.onSave as ActionsBag);
    }
    if (node.type === "actions") bags.push(node.actions as ActionsBag);
    for (const b of bags) {
      if ((b.addToLists?.length ?? 0) + (b.removeFromLists?.length ?? 0) > 0) {
        warnings.push({
          code: "ACTION_LIST_ID",
          nodeId: node.id,
          message:
            "Inline-actions содержит listIds — IDs списков локальны для исходного бота. Откройте ноду и переподключите.",
        });
        break; // одна warning на ноду
      }
    }
  }
  // Триггеры tracking_link — payloads-слаги перенесутся, но самих
  // TgTrackingLink в новом боте нет. Напоминаем создать.
  for (const t of exp.triggers) {
    if (t.type === "command" && (t.payloads?.length ?? 0) > 0) {
      warnings.push({
        code: "TRIGGER_TRACKING_LINK",
        nodeId: null,
        message: `В триггере /${t.command} есть payloads (${(t.payloads ?? []).join(", ")}) — создайте соответствующие tracking-links в новом боте.`,
      });
    }
  }
  return warnings;
}
