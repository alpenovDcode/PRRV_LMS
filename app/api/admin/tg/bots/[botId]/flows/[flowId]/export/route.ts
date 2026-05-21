import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import { buildFlowExport } from "@/lib/tg/flow-export";
import type { FlowGraph, FlowTrigger } from "@/lib/tg/flow-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Экспорт флоу как portable JSON. Скачивается как файл; для quick-share
// можно скопировать тело ответа и переслать.
export async function GET(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string; flowId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async () => {
      const flow = await db.tgFlow.findFirst({
        where: { id: params.flowId, botId: params.botId },
        include: { bot: { select: { username: true } } },
      });
      if (!flow) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Flow not found" } },
          { status: 404 }
        );
      }
      const exp = buildFlowExport({
        name: flow.name,
        description: flow.description,
        graph: flow.graph as unknown as FlowGraph,
        triggers: (flow.triggers ?? []) as unknown as FlowTrigger[],
        sourceBotUsername: flow.bot.username,
        sourceFlowId: flow.id,
      });
      // Возвращаем как JSON-файл с Content-Disposition, чтобы браузер
      // предложил «Сохранить как». Если читают программно — это
      // обычный JSON, всё ок.
      const url = new URL(request.url);
      const asAttachment =
        url.searchParams.get("download") !== "0";
      const safeName = flow.name
        .replace(/[^a-zA-Zа-яА-Я0-9_\-\s]/g, "")
        .trim()
        .replace(/\s+/g, "_")
        .slice(0, 80) || "flow";
      const headers: Record<string, string> = {
        "Content-Type": "application/json; charset=utf-8",
      };
      if (asAttachment) {
        headers["Content-Disposition"] =
          `attachment; filename="${safeName}.flow.json"`;
      }
      return new NextResponse(JSON.stringify(exp, null, 2), { headers });
    },
    { roles: ["admin"] }
  );
}
