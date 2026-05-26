import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";

/**
 * POST /api/admin/monitoring/ai-homework/[id]/retry
 *
 * Перезапуск AI-проверки для submission. Идемпотентный:
 *   1. Сбрасываем aiAnalysisError, aiAnalyzedAt, aiSuggested*, aiAnalysisStartedAt.
 *   2. Если есть запись в HomeworkAIQueue — возвращаем её в waiting с attempts=0 и
 *      checkAfter=now (cron подберёт сразу же).
 *   3. Если записи нет, но в уроке aiPrompt — НЕ создаём (это ответственность Path A);
 *      админ должен открыть конкретное ДЗ и нажать «Проверка от Джарвикса».
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    req,
    async () => {
      const { id } = await params;

      const submission = await db.homeworkSubmission.findUnique({
        where: { id },
        select: { id: true, status: true },
      });
      if (!submission) {
        return NextResponse.json(
          { success: false, error: "ДЗ не найдено" },
          { status: 404 }
        );
      }

      // 1. Сбрасываем AI-поля
      await db.homeworkSubmission.update({
        where: { id },
        data: {
          aiAnalysisError: null,
          aiAnalyzedAt: null,
          aiAnalysisStartedAt: null,
          aiSuggestedVerdict: null,
          aiSuggestedComment: null,
        } as any,
      });

      // 2. Реактивируем очередь если есть
      const updated = await db.homeworkAIQueue.updateMany({
        where: { submissionId: id },
        data: {
          status: "waiting",
          attempts: 0,
          lastError: null,
          checkAfter: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        queueReactivated: updated.count > 0,
      });
    },
    { roles: [UserRole.admin] }
  );
}
