import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { extractIp, hashIp, verifyClickSignature } from "@/lib/email/tracking/utils";

/**
 * GET /api/email/track/click/[recipientId]?url=...&sig=...
 *
 * Public endpoint. Записывает EmailEvent type=clicked и редиректит на оригинальный URL.
 *
 * recipientId формат:
 *   - UUID — EmailDeliveryJob.id (маркетинговая кампания)
 *   - UUID — BroadcastRecipient.id (LMS-рассылка)
 *   - "auto:<runId>:<stepIndex>" — EmailAutomationRun (welcome-цепочки)
 *
 * url передаётся как query param, URL-encoded.
 * sig — HMAC-подпись (recipientId, url) для защиты от open-redirect. См.
 * lib/email/tracking/utils.ts signClickUrl/verifyClickSignature.
 *
 * Защита:
 *   1. Только http(s) схемы.
 *   2. Не разрешаем редирект на тот же tracking-endpoint (защита от петель).
 *   3. Невалидный URL → 400.
 *   4. Невалидная sig → 400. Без sig: legacy-режим (старые письма до релиза
 *      подписи) — пропускаем с предупреждением в логах.
 *
 * Производительность: запись в БД асинхронно, редирект отдаётся сразу.
 */

interface RouteContext {
  params: Promise<{ recipientId: string }>;
}

const TRACKING_PATH_RE = /\/api\/email\/track\//;

export async function GET(request: NextRequest, context: RouteContext) {
  const { recipientId } = await context.params;
  const url = request.nextUrl.searchParams.get("url");
  const sig = request.nextUrl.searchParams.get("sig");

  if (!url) {
    return NextResponse.json({ ok: false, error: "url query required" }, { status: 400 });
  }

  // Валидация URL.
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid url" }, { status: 400 });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json({ ok: false, error: "scheme not allowed" }, { status: 400 });
  }
  if (TRACKING_PATH_RE.test(parsed.pathname)) {
    return NextResponse.json({ ok: false, error: "self-referential redirect" }, { status: 400 });
  }

  // Подпись: если есть — должна совпасть. Если нет (legacy) — пропускаем с warn.
  if (sig) {
    if (!verifyClickSignature(recipientId, url, sig)) {
      return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 400 });
    }
  } else {
    console.warn(
      `[track/click] legacy unsigned click for recipient=${recipientId}. ` +
        "All new emails sign URLs — this should disappear within a few months."
    );
  }

  const userAgent = request.headers.get("user-agent");
  const ipHash = hashIp(extractIp(request.headers));

  recordClick(recipientId, url, userAgent, ipHash).catch((e) => {
    console.error("[track/click] failed:", e);
  });

  return NextResponse.redirect(url, { status: 302 });
}

async function recordClick(
  recipientId: string,
  url: string,
  userAgent: string | null,
  ipHash: string | null
): Promise<void> {
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
        type: "clicked",
        url,
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
          type: "clicked",
          url,
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

  // LMS-рассылка.
  const br = await db.broadcastRecipient.findUnique({
    where: { id: recipientId },
    select: { id: true, userId: true, email: true, clickCount: true },
  });
  if (br) {
    await db.$transaction([
      db.emailEvent.create({
        data: {
          userId: br.userId,
          email: br.email ?? "",
          recipientId: br.id,
          type: "clicked",
          url,
          userAgent,
          ipHash,
        },
      }),
      db.broadcastRecipient.update({
        where: { id: br.id },
        data: {
          clickedAt: br.clickCount === 0 ? new Date() : undefined,
          clickCount: { increment: 1 },
        },
      }),
    ]);
  }
}
