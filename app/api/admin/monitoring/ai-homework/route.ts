import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { z } from "zod";

const STALE_MS = 60 * 60 * 1000; // 1 час — после этого считаем зависшим

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  filter: z
    .enum(["all", "queued", "in_progress", "stuck", "failed", "completed"])
    .default("all"),
  search: z.string().max(100).optional(),
});

/**
 * GET /api/admin/monitoring/ai-homework
 *
 * Возвращает submissions у которых задействована AI-проверка, объединяя
 * данные из HomeworkSubmission (поля ai_*) и HomeworkAIQueue.
 *
 * Категории статуса:
 *   queued       — в очереди, ждёт обработки кроном
 *   in_progress  — анализ запущен (Path D), ждём callback от AI-checker
 *   stuck        — in_progress > 1 часа без результата (cleanup-cron пометит позже)
 *   failed       — есть aiAnalysisError или queue.attempts >= MAX_ATTEMPTS
 *   completed    — есть aiAnalyzedAt или submission.status != pending
 */
export async function GET(req: NextRequest) {
  return withAuth(
    req,
    async () => {
      const { searchParams } = new URL(req.url);
      const parsed = querySchema.safeParse({
        page: searchParams.get("page") ?? undefined,
        filter: searchParams.get("filter") ?? undefined,
        search: searchParams.get("search") ?? undefined,
      });
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: "Некорректные параметры" },
          { status: 400 }
        );
      }
      const { page, filter, search } = parsed.data;
      const limit = 50;
      const skip = (page - 1) * limit;
      const now = new Date();
      const staleCutoff = new Date(now.getTime() - STALE_MS);

      // Базовый where — ДЗ у которых есть aiPrompt в уроке ИЛИ есть запись в очереди
      const baseWhere: any = {
        OR: [
          { aiAnalysisStartedAt: { not: null } },
          { lesson: { aiPrompt: { not: null } } },
        ],
      };
      if (search) {
        baseWhere.user = {
          OR: [
            { email: { contains: search, mode: "insensitive" } },
            { fullName: { contains: search, mode: "insensitive" } },
          ],
        };
      }

      // Фильтр по статусу. Для категорий используем дополнительные условия.
      let where = baseWhere;
      switch (filter) {
        case "in_progress":
          where = {
            ...baseWhere,
            aiAnalysisStartedAt: { gte: staleCutoff, not: null },
            aiAnalyzedAt: null,
            aiAnalysisError: null,
          };
          break;
        case "stuck":
          where = {
            ...baseWhere,
            aiAnalysisStartedAt: { lt: staleCutoff, not: null },
            aiAnalyzedAt: null,
            aiAnalysisError: null,
          };
          break;
        case "failed":
          where = { ...baseWhere, aiAnalysisError: { not: null } };
          break;
        case "completed":
          where = {
            ...baseWhere,
            OR: [
              { aiAnalyzedAt: { not: null } },
              { status: { in: ["approved", "rejected"] } },
            ],
          };
          break;
        case "queued":
          // submissions в очереди, ещё не начатые
          where = {
            ...baseWhere,
            aiAnalysisStartedAt: null,
            status: "pending",
            aiAnalysisError: null,
          };
          break;
      }

      const [items, total] = await Promise.all([
        db.homeworkSubmission.findMany({
          where,
          orderBy: [{ aiAnalysisStartedAt: "desc" }, { createdAt: "desc" }],
          skip,
          take: limit,
          select: {
            id: true,
            status: true,
            createdAt: true,
            reviewedAt: true,
            curatorComment: true,
            curatorId: true,
            aiSuggestedVerdict: true,
            aiSuggestedComment: true,
            aiAnalyzedAt: true,
            aiAnalysisStartedAt: true,
            aiAnalysisError: true,
            user: { select: { id: true, email: true, fullName: true } },
            lesson: { select: { id: true, title: true, aiPrompt: true } },
          } as any,
        }),
        db.homeworkSubmission.count({ where }),
      ]);

      // Подтянем связанные queue-записи для категории mode и attempts
      const ids = items.map((i: any) => i.id);
      const queue =
        ids.length > 0
          ? await db.homeworkAIQueue.findMany({
              where: { submissionId: { in: ids } },
              select: {
                submissionId: true,
                mode: true,
                status: true,
                attempts: true,
                lastError: true,
                checkAfter: true,
                updatedAt: true,
              } as any,
            })
          : [];
      const queueBySub: Record<string, any> = Object.fromEntries(
        queue.map((q: any) => [q.submissionId, q])
      );

      // Категоризуем каждую запись
      const enriched = items.map((s: any) => {
        const q = queueBySub[s.id];
        let category: string;
        if (s.aiAnalyzedAt || (s.status !== "pending" && s.status !== undefined)) {
          category = "completed";
        } else if (s.aiAnalysisError) {
          category = "failed";
        } else if (s.aiAnalysisStartedAt && s.aiAnalysisStartedAt < staleCutoff) {
          category = "stuck";
        } else if (s.aiAnalysisStartedAt) {
          category = "in_progress";
        } else if (q) {
          category = "queued";
        } else {
          category = "queued";
        }

        return {
          ...s,
          category,
          mode: q?.mode ?? "auto_approve",
          queueStatus: q?.status ?? null,
          queueAttempts: q?.attempts ?? 0,
          queueCheckAfter: q?.checkAfter ?? null,
          queueLastError: q?.lastError ?? null,
        };
      });

      return NextResponse.json({
        success: true,
        data: enriched,
        meta: { total, page, limit, pages: Math.ceil(total / limit) },
      });
    },
    { roles: [UserRole.admin] }
  );
}
