import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { logAction } from "@/lib/audit";
import { z } from "zod";

const schema = z.object({
  verdict: z.enum(["approved", "rejected"]),
  comment: z.string().min(1).max(5000),
  /**
   * Куда писать результат:
   *   "auto_approve" — финальный статус ДЗ (как делает legacy ai-result endpoint).
   *                    ДЗ сразу видно студенту как проверенное.
   *   "suggest"      — пишем в aiSuggested* (как Path D). Куратор увидит и решит сам.
   * Если не указан — определяется по тому, есть ли aiAnalysisStartedAt:
   *   есть → suggest, нет → auto_approve.
   */
  mode: z.enum(["auto_approve", "suggest"]).optional(),
});

/**
 * POST /api/admin/monitoring/ai-homework/[id]/manual-result
 *
 * Админ вводит verdict + comment вручную — например когда AI-checker реально
 * проверил ДЗ, но callback потерялся (сеть, перезапуск контейнера, etc.).
 *
 * Логируется в AuditLog как HOMEWORK_MANUAL_AI_RESULT.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    req,
    async (authedReq) => {
      const { id } = await params;
      const body = await req.json().catch(() => null);
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: "Некорректный verdict или comment" },
          { status: 400 }
        );
      }
      const { verdict, comment } = parsed.data;

      const submission = await db.homeworkSubmission.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          aiAnalysisStartedAt: true,
        } as any,
      });
      if (!submission) {
        return NextResponse.json(
          { success: false, error: "ДЗ не найдено" },
          { status: 404 }
        );
      }

      // Определяем режим если не передан явно
      const subAny = submission as any;
      const mode =
        parsed.data.mode ?? (subAny.aiAnalysisStartedAt ? "suggest" : "auto_approve");

      if (mode === "suggest") {
        await db.homeworkSubmission.update({
          where: { id },
          data: {
            aiSuggestedVerdict: verdict,
            aiSuggestedComment: comment,
            aiAnalyzedAt: new Date(),
            aiAnalysisError: null,
          } as any,
        });
      } else {
        // auto_approve — пишем как финальный статус (повторяем ai-result логику).
        // Идемпотентно: если ДЗ уже не pending — не перезаписываем.
        const curStatus = String((submission as any).status);
        if (curStatus !== "pending") {
          return NextResponse.json(
            {
              success: false,
              error: `ДЗ уже в статусе "${curStatus}". Если хочешь поменять — действуй через стандартный review.`,
            },
            { status: 409 }
          );
        }
        await db.homeworkSubmission.update({
          where: { id },
          data: {
            status: verdict,
            curatorComment: comment,
            curatorId: authedReq.user!.userId, // помечаем кем внесён ручной результат
            reviewedAt: new Date(),
          },
        });
      }

      // Убираем из очереди — задача отработана вручную
      await db.homeworkAIQueue.deleteMany({ where: { submissionId: id } });

      await logAction(
        authedReq.user!.userId,
        "HOMEWORK_MANUAL_AI_RESULT",
        "HomeworkSubmission",
        id,
        { verdict, mode, commentLength: comment.length }
      ).catch(() => {});

      return NextResponse.json({ success: true, mode, verdict });
    },
    { roles: [UserRole.admin] }
  );
}
