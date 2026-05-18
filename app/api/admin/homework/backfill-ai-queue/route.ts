/**
 * POST /api/admin/homework/backfill-ai-queue
 * Разовый эндпоинт: ставит все pending ДЗ с aiPrompt в очередь AI-проверки.
 * Вызывается один раз после деплоя для обработки накопившегося бэклога.
 */
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";

export async function POST(request: NextRequest) {
  return withAuth(request, async (req) => {
    if (req.user?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const pending = await db.homeworkSubmission.findMany({
      where: { status: "pending" },
      include: {
        lesson: {
          select: {
            title: true,
            content: true,
            aiPrompt: true,
            aiContext: true,
            hasImageAnalysis: true,
          },
        },
        user: { select: { fullName: true, email: true } },
      },
    });

    const withAI = pending.filter((s) => s.lesson?.aiPrompt);
    let queued = 0;
    let skipped = 0;

    for (const sub of withAI) {
      const lesson = sub.lesson!;
      const existing = await db.homeworkAIQueue.findUnique({
        where: { submissionId: sub.id },
      });
      if (existing) {
        skipped++;
        continue;
      }
      await db.homeworkAIQueue.create({
        data: {
          submissionId: sub.id,
          lessonTitle: lesson.title,
          studentName: sub.user.fullName ?? sub.user.email,
          studentAnswer: sub.content ?? "",
          aiPrompt: lesson.aiPrompt!,
          aiContext: lesson.aiContext ?? null,
          imageFiles: lesson.hasImageAnalysis
            ? ((sub.files as string[]) || [])
            : [],
          lessonContent: lesson.content ?? null,
          checkAfter: new Date(), // проверяем немедленно
          status: "waiting",
        },
      });
      queued++;
    }

    return NextResponse.json({
      ok: true,
      total_pending: pending.length,
      with_ai_prompt: withAI.length,
      queued,
      skipped_already_queued: skipped,
    });
  });
}
