import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole, Prisma } from "@prisma/client";
import { ApiResponse } from "@/types";

function parseDate(s: string | null): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      const url = new URL(request.url);
      const from = parseDate(url.searchParams.get("from"));
      const to = parseDate(url.searchParams.get("to"));
      const curatorId = url.searchParams.get("curatorId") || undefined;
      const groupId = url.searchParams.get("groupId") || undefined;

      const where: Prisma.QuestionWhereInput = {};
      if (from || to) {
        where.createdAt = {};
        if (from) (where.createdAt as any).gte = from;
        if (to) (where.createdAt as any).lte = to;
      }
      if (curatorId) where.curatorId = curatorId;
      if (groupId) {
        where.student = { groupMembers: { some: { groupId } } };
      }

      const questions = await db.question.findMany({
        where,
        include: {
          student: { select: { id: true, fullName: true, email: true } },
          curator: { select: { id: true, fullName: true, email: true } },
          _count: { select: { messages: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      const total = questions.length;
      const byStatus = { open: 0, in_progress: 0, answered: 0, closed: 0 } as Record<string, number>;
      const ratingDist = Array.from({ length: 10 }, (_, i) => ({ rating: i + 1, count: 0 }));
      let firstRespSum = 0, firstRespN = 0;
      let dialogSum = 0, dialogN = 0;
      let ratingSum = 0, ratingN = 0;

      const perCuratorMap = new Map<string, any>();

      for (const q of questions) {
        byStatus[q.status]++;
        if (q.firstResponseAt) {
          firstRespSum += (q.firstResponseAt.getTime() - q.createdAt.getTime()) / 1000;
          firstRespN++;
        }
        const endTime = q.closedAt || q.updatedAt;
        if (endTime) {
          dialogSum += (endTime.getTime() - q.createdAt.getTime()) / 1000;
          dialogN++;
        }
        if (q.rating != null) {
          ratingSum += q.rating;
          ratingN++;
          ratingDist[q.rating - 1].count++;
        }
        if (q.curator) {
          const k = q.curator.id;
          if (!perCuratorMap.has(k)) {
            perCuratorMap.set(k, {
              curatorId: k,
              name: q.curator.fullName || q.curator.email,
              taken: 0,
              closed: 0,
              firstRespSum: 0,
              firstRespN: 0,
              ratingSum: 0,
              ratingN: 0,
            });
          }
          const c = perCuratorMap.get(k);
          c.taken++;
          if (q.status === "closed" || q.status === "answered") c.closed++;
          if (q.firstResponseAt) {
            c.firstRespSum += (q.firstResponseAt.getTime() - q.createdAt.getTime()) / 1000;
            c.firstRespN++;
          }
          if (q.rating != null) {
            c.ratingSum += q.rating;
            c.ratingN++;
          }
        }
      }

      const perCurator = Array.from(perCuratorMap.values()).map((c) => ({
        curatorId: c.curatorId,
        name: c.name,
        taken: c.taken,
        closed: c.closed,
        avgFirstResponseSec: c.firstRespN ? Math.round(c.firstRespSum / c.firstRespN) : null,
        avgRating: c.ratingN ? +(c.ratingSum / c.ratingN).toFixed(2) : null,
      }));

      // Per week
      const weekMap = new Map<string, number>();
      for (const q of questions) {
        const d = new Date(q.createdAt);
        // ISO week start (Mon)
        const day = d.getUTCDay() || 7;
        d.setUTCHours(0, 0, 0, 0);
        d.setUTCDate(d.getUTCDate() - day + 1);
        const k = d.toISOString().slice(0, 10);
        weekMap.set(k, (weekMap.get(k) || 0) + 1);
      }
      const perWeek = Array.from(weekMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([weekStart, count]) => ({ weekStart, count }));

      // Last 7 days count
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const lastWeekCount = questions.filter((q) => q.createdAt >= weekAgo).length;

      return NextResponse.json<ApiResponse>({
        success: true,
        data: {
          totalQuestions: total,
          byStatus,
          lastWeekCount,
          avgFirstResponseSec: firstRespN ? Math.round(firstRespSum / firstRespN) : null,
          avgDialogDurationSec: dialogN ? Math.round(dialogSum / dialogN) : null,
          avgRating: ratingN ? +(ratingSum / ratingN).toFixed(2) : null,
          ratingDistribution: ratingDist,
          perCurator,
          perWeek,
        },
      });
    },
    { roles: [UserRole.admin] }
  );
}
