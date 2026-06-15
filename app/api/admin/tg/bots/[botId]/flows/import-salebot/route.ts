/**
 * POST /api/admin/tg/bots/[botId]/flows/import-salebot
 *
 * Принимает JSON-выгрузку из Salebot и создаёт в боте:
 *   - 1 главный TgFlow с импортированной воронкой
 *   - N дополнительных TgFlow для каждой реактивной ноды Salebot
 *     (тех что message_type=5: «при клике по ссылке», «при событии
 *     GetCourse» и т.п. — у нас они становятся отдельным flow со
 *     своим триггером)
 *
 * Возвращает report — что замаплено, что пропущено, что в TODO. Это
 * нужно админу, чтобы знать какие ноды требуют ручной доводки в
 * редакторе после импорта.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import {
  importSalebot,
  type SalebotExport,
} from "@/lib/tg/salebot-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Импорт может проходить тысячи нод — увеличиваем лимит.
export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async (req) => {
      const body = (await req.json().catch(() => null)) as
        | SalebotExport
        | null;
      if (!body || !Array.isArray(body.messages)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "BAD_INPUT",
              message:
                "Ожидается JSON-выгрузка Salebot с массивом messages[]",
            },
          },
          { status: 400 }
        );
      }
      const bot = await db.tgBot.findUnique({ where: { id: params.botId } });
      if (!bot) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Бот не найден" } },
          { status: 404 }
        );
      }

      let result;
      try {
        result = importSalebot(body);
      } catch (e) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "IMPORT_FAILED",
              message:
                (e as Error)?.message ?? "Импортёр упал при парсинге JSON",
            },
          },
          { status: 400 }
        );
      }

      // Записываем главный flow + extraFlows в одной транзакции, чтобы
      // не создать «полуимпорт» при сбое БД на одном из под-flows.
      const created = await db.$transaction(async (tx) => {
        const main = await tx.tgFlow.create({
          data: {
            botId: bot.id,
            name: result.flowName,
            description: "Импорт из Salebot JSON",
            graph: result.graph as object,
            triggers: result.triggers as object,
          },
        });
        const extras = [];
        for (const ef of result.extraFlows) {
          const sub = await tx.tgFlow.create({
            data: {
              botId: bot.id,
              name: ef.name,
              description: ef.description ?? null,
              graph: ef.graph as object,
              triggers: ef.triggers as object,
            },
          });
          extras.push({ id: sub.id, name: sub.name });
        }
        return { mainId: main.id, mainName: main.name, extras };
      });

      return NextResponse.json({
        success: true,
        data: {
          createdFlow: { id: created.mainId, name: created.mainName },
          createdExtraFlows: created.extras,
          report: result.report,
        },
      });
    },
    { roles: ["admin"] }
  );
}
