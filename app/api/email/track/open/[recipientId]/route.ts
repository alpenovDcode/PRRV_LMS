import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { extractIp, hashIp, TRACKING_GIF, TRACKING_GIF_HEADERS } from "@/lib/email/tracking/utils";

/**
 * GET /api/email/track/open/[recipientId]
 *
 * Public endpoint (в whitelist middleware). Возвращает 1×1 GIF и
 * асинхронно записывает EmailEvent type=opened — ОДИН РАЗ на recipientId.
 *
 * recipientId формат:
 *   - UUID — EmailDeliveryJob.id (маркетинговая кампания)
 *   - UUID — BroadcastRecipient.id (LMS-рассылка)
 *   - "auto:<runId>:<stepIndex>" — EmailAutomationRun (welcome-цепочки)
 *
 * Расширение `.gif` опционально — Next отдаст файл в любом случае.
 *
 * Дедуп: Gmail / Yandex Mail prefetch'ат пиксели + каждое сохранение в архив
 * пробивает наш endpoint. Без дедупа EmailEvent растёт миллионами строк,
 * open rate завышается в 2-5x. Записываем только первое открытие на recipient.
 *
 * Privacy: IP не пишем в чистом виде — sha256 + salt (см. utils.ts).
 */

interface RouteContext {
  params: Promise<{ recipientId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { recipientId: rawId } = await context.params;
  const recipientId = rawId.replace(/\.gif$/i, "");

  const userAgent = request.headers.get("user-agent");
  const ipHash = hashIp(extractIp(request.headers));

  recordOpen(recipientId, userAgent, ipHash).catch((e) => {
    console.error("[track/open] failed:", e);
  });

  return new Response(TRACKING_GIF, { status: 200, headers: TRACKING_GIF_HEADERS });
}

async function recordOpen(
  recipientId: string,
  userAgent: string | null,
  ipHash: string | null
): Promise<void> {
  // Дедуп: одно открытие на recipient. Дальнейшие пиксели игнорируем.
  const existing = await db.emailEvent.findFirst({
    where: { recipientId, type: "opened" },
    select: { id: true },
  });
  if (existing) return;

  // Маркетинговая кампания.
  const job = await db.emailDeliveryJob.findUnique({
    where: { id: recipientId },
    select: { id: true, userId: true, email: true, campaignId: true },
  });

  if (job) {
    await db.emailEvent.create({
      data: {
        userId: job.userId,
        email: job.email,
        campaignId: job.campaignId,
        recipientId: job.id,
        type: "opened",
        userAgent,
        ipHash,
      },
    });
    return;
  }

  // Автоматизация. recipientId формата "auto:<runId>:<stepIndex>".
  if (recipientId.startsWith("auto:")) {
    const [, runId, stepStr] = recipientId.split(":");
    if (!runId) return;
    const run = await db.emailAutomationRun.findUnique({
      where: { id: runId },
      select: { id: true, userId: true, automationId: true, user: { select: { email: true } } },
    });
    if (run) {
      await db.emailEvent.create({
        data: {
          userId: run.userId,
          email: run.user.email,
          recipientId,
          type: "opened",
          userAgent,
          ipHash,
          metadata: {
            automationId: run.automationId,
            automationRunId: run.id,
            stepIndex: Number(stepStr) || 0,
          },
        },
      });
    }
    return;
  }

  // LMS-рассылка (Broadcast).
  const br = await db.broadcastRecipient.findUnique({
    where: { id: recipientId },
    select: { id: true, userId: true, email: true, openCount: true },
  });

  if (br) {
    await db.$transaction([
      db.emailEvent.create({
        data: {
          userId: br.userId,
          email: br.email ?? "",
          recipientId: br.id,
          type: "opened",
          userAgent,
          ipHash,
        },
      }),
      db.broadcastRecipient.update({
        where: { id: br.id },
        data: {
          openedAt: br.openCount === 0 ? new Date() : undefined,
          openCount: { increment: 1 },
        },
      }),
    ]);
  }
}
