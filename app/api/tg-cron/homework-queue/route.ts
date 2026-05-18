import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const CRON_SECRET = process.env.TG_CRON_SECRET || "";
const AI_CHECKER_URL = process.env.AI_CHECKER_URL || "http://localhost:3000";
const AI_CHECKER_KEY = process.env.AI_CHECKER_KEY || "";
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5 * 60 * 1000; // 5 минут между попытками

export async function POST(request: NextRequest) {
  const secret =
    request.headers.get("x-cron-secret") ||
    request.nextUrl.searchParams.get("secret") ||
    "";
  if (CRON_SECRET && secret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const items = await db.homeworkAIQueue.findMany({
    where: {
      status: "waiting",
      checkAfter: { lte: now },
      attempts: { lt: MAX_ATTEMPTS },
    },
    take: 10,
    orderBy: { checkAfter: "asc" },
  });

  if (items.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, errors: 0 });
  }

  await db.homeworkAIQueue.updateMany({
    where: { id: { in: items.map((i) => i.id) } },
    data: { status: "processing" },
  });

  let processed = 0;
  let errors = 0;

  for (const item of items) {
    // Если куратор уже проверил — убираем из очереди
    const sub = await db.homeworkSubmission.findUnique({
      where: { id: item.submissionId },
      select: { status: true },
    });
    if (!sub || sub.status !== "pending") {
      await db.homeworkAIQueue.delete({ where: { id: item.id } });
      processed++;
      continue;
    }

    try {
      const resp = await fetch(`${AI_CHECKER_URL}/api/homework/check`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": AI_CHECKER_KEY,
        },
        body: JSON.stringify({
          submissionId: item.submissionId,
          studentAnswer: item.studentAnswer,
          aiPrompt: item.aiPrompt,
          aiContext: item.aiContext,
          imageFiles: item.imageFiles,
          lessonTitle: item.lessonTitle,
          lessonContent: item.lessonContent,
          studentName: item.studentName,
        }),
        signal: AbortSignal.timeout(300_000),
      });

      if (resp.ok) {
        await db.homeworkAIQueue.delete({ where: { id: item.id } });
        processed++;
      } else {
        const errText = await resp.text();
        await db.homeworkAIQueue.update({
          where: { id: item.id },
          data: {
            status: "waiting",
            attempts: item.attempts + 1,
            lastError: `HTTP ${resp.status}: ${errText.slice(0, 300)}`,
            checkAfter: new Date(Date.now() + RETRY_DELAY_MS),
          },
        });
        errors++;
      }
    } catch (err) {
      await db.homeworkAIQueue.update({
        where: { id: item.id },
        data: {
          status: "waiting",
          attempts: item.attempts + 1,
          lastError: String(err).slice(0, 300),
          checkAfter: new Date(Date.now() + RETRY_DELAY_MS),
        },
      });
      errors++;
    }
  }

  return NextResponse.json({ ok: true, processed, errors, total: items.length });
}
