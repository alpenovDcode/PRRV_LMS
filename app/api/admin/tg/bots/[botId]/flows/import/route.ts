import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import {
  flowExportSchema,
  analyzeImportWarnings,
  type ImportWarning,
} from "@/lib/tg/flow-export";
import {
  convertSalebotToFlowExport,
  isSalebotFlowExport,
  type SalebotImportWarning,
} from "@/lib/tg/salebot-flow-converter";
import {
  extractSalebotVariables,
  ensureSalebotFlowFields,
} from "@/lib/tg/salebot-flow-variables";
import { trackEvent } from "@/lib/tg/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const inputSchema = z.object({
  // Сам экспорт. Может прилететь как объект или строкой (часто
  // удобнее: вставил JSON в textarea — отправил «как есть»).
  data: z.union([flowExportSchema, z.string().min(2)]),
  // Опционально: переопределить имя/описание на стороне импорта.
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  // dryRun=true — только проверка + warnings, без записи в БД.
  dryRun: z.boolean().optional().default(false),
});

export async function POST(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async (req) => {
      const body = await req.json().catch(() => null);
      const parsed = inputSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: { code: "BAD_INPUT", message: parsed.error.message } },
          { status: 400 }
        );
      }

      // Если data — строка, парсим JSON и решаем формат: наш FlowExport
      // или выгрузка SaleBot (auto-detect по полям messages/connections).
      let exp;
      let salebotWarnings: SalebotImportWarning[] = [];
      let salebotStats: Record<string, number> | null = null;
      let formatDetected: "flow_export" | "salebot" = "flow_export";
      // Сырой SaleBot payload — нужен ниже для extractSalebotVariables
      // (наш конвертер не сохраняет исходные #{var} в чистом виде,
      // он их превращает в {{var}}; для угадывания типа полей удобнее
      // ходить по оригинальной структуре).
      let salebotPayload:
        | { messages: any[]; connections: any[] }
        | null = null;

      if (typeof parsed.data.data === "string") {
        let asJson: unknown;
        try {
          asJson = JSON.parse(parsed.data.data);
        } catch (e) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: "INVALID_JSON",
                message: `Невалидный JSON: ${e instanceof Error ? e.message : String(e)}`,
              },
            },
            { status: 400 }
          );
        }
        // 1) SaleBot-выгрузка — конвертируем в наш FlowExport.
        if (isSalebotFlowExport(asJson)) {
          formatDetected = "salebot";
          salebotPayload = asJson as { messages: any[]; connections: any[] };
          const result = convertSalebotToFlowExport(
            asJson,
            parsed.data.name ?? "SaleBot import"
          );
          exp = result.flow;
          salebotWarnings = result.warnings;
          salebotStats = result.stats;
        } else {
          // 2) Иначе — ждём наш формат FlowExport.
          const parsedExp = flowExportSchema.safeParse(asJson);
          if (!parsedExp.success) {
            return NextResponse.json(
              {
                success: false,
                error: {
                  code: "BAD_EXPORT",
                  message: `Файл не похож ни на flow-export, ни на SaleBot-выгрузку: ${parsedExp.error.message}`,
                },
              },
              { status: 400 }
            );
          }
          exp = parsedExp.data;
        }
      } else {
        exp = parsed.data.data;
      }

      const exportWarnings: ImportWarning[] = analyzeImportWarnings(exp);
      // SaleBot-предупреждения подмешиваем к общим — UI рендерит единым
      // списком (поле message читается и там и там).
      const warnings = [
        ...exportWarnings,
        ...salebotWarnings.map((w) => ({
          code: `SALEBOT_${w.code}` as ImportWarning["code"],
          nodeId: w.nodeId ?? null,
          message: w.message,
        })),
      ];

      // Sanity-check: все ссылки внутри графа разрешаются. (Zod-схема
      // уже не пропустит мусор, но битые ссылки между нодами проверяем
      // как в POST /flows.)
      const nodeIds = new Set(exp.graph.nodes.map((n) => n.id));
      if (!nodeIds.has(exp.graph.startNodeId)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "BAD_GRAPH",
              message: `startNodeId «${exp.graph.startNodeId}» не найден в нодах`,
            },
          },
          { status: 400 }
        );
      }
      for (const n of exp.graph.nodes) {
        const refs: Array<string | undefined> = [];
        if ("next" in n) refs.push(n.next);
        if (n.type === "wait_reply") refs.push(n.timeoutNext);
        if (n.type === "condition") {
          refs.push(n.defaultNext);
          for (const r of n.rules) refs.push(r.next);
        }
        if (n.type === "http_request") refs.push(n.onError);
        if (n.type === "split") {
          for (const b of n.branches) refs.push(b.next);
        }
        for (const r of refs) {
          if (r && !nodeIds.has(r)) {
            return NextResponse.json(
              {
                success: false,
                error: {
                  code: "BAD_GRAPH",
                  message: `node «${n.id}» ссылается на несуществующую ноду «${r}»`,
                },
              },
              { status: 400 }
            );
          }
        }
      }

      // ── Если это SaleBot, заранее извлекаем переменные —
      // используем и в dry-run отчёте, и при реальном импорте.
      const variablesPreview = salebotPayload
        ? extractSalebotVariables({
            messages: salebotPayload.messages,
            connections: salebotPayload.connections,
          })
        : [];

      if (parsed.data.dryRun) {
        return NextResponse.json({
          success: true,
          data: {
            dryRun: true,
            name: parsed.data.name ?? exp.name,
            nodeCount: exp.graph.nodes.length,
            triggerCount: exp.triggers.length,
            warnings,
            format: formatDetected,
            salebotStats,
            // В dry-run показываем «будут заведены такие-то поля» —
            // без реального createMany. Уже существующие пометятся
            // как skipped после реального импорта.
            variablesDetected: variablesPreview.map((v) => ({
              key: v.key,
              type: v.type,
              label: v.label,
              source: Array.from(v.source),
            })),
          },
        });
      }

      const flow = await db.tgFlow.create({
        data: {
          botId: params.botId,
          name: parsed.data.name ?? exp.name,
          description: parsed.data.description ?? exp.description ?? null,
          graph: exp.graph as object,
          triggers: exp.triggers as object,
          isActive: false, // импорт по умолчанию выключенный — пусть админ
                           // сначала проверит и подключит зависимости
        },
      });

      // ── Авто-создание TgCustomField definitions из найденных
      //    переменных. Только для SaleBot-формата (для нашего
      //    flow-export админ управляет полями вручную).
      //    Идемпотентно: существующие поля НЕ перезаписываются.
      let fieldsCreated: {
        createdCount: number;
        createdKeys: string[];
        skippedKeys: string[];
      } = { createdCount: 0, createdKeys: [], skippedKeys: [] };
      if (formatDetected === "salebot" && variablesPreview.length > 0) {
        fieldsCreated = await ensureSalebotFlowFields(
          db,
          params.botId,
          variablesPreview
        );
      }

      trackEvent({
        type: "flow.imported",
        botId: params.botId,
        properties: {
          flowId: flow.id,
          sourceBotUsername: exp.sourceBotUsername ?? null,
          sourceFlowId: exp.sourceFlowId ?? null,
          warningCount: warnings.length,
          userId: req.user?.userId ?? null,
        },
      }).catch(() => {});

      return NextResponse.json({
        success: true,
        data: {
          id: flow.id,
          name: flow.name,
          nodeCount: exp.graph.nodes.length,
          triggerCount: exp.triggers.length,
          warnings,
          format: formatDetected,
          salebotStats,
          // Сколько TgCustomField definitions создано на этом импорте
          // и какие ключи. skippedKeys — те, что уже существовали и не
          // тронуты (защита кастомизации админа).
          customFieldsCreated: fieldsCreated.createdCount,
          customFieldKeysCreated: fieldsCreated.createdKeys,
          customFieldKeysSkipped: fieldsCreated.skippedKeys,
          variablesDetected: variablesPreview.map((v) => ({
            key: v.key,
            type: v.type,
            label: v.label,
            source: Array.from(v.source),
          })),
        },
      });
    },
    { roles: ["admin"] }
  );
}
