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
      try {
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
        if (groupId) where.student = { groupMembers: { some: { groupId } } };

        const questions = await db.question.findMany({
          where,
          select: {
            id: true,
            status: true,
            rating: true,
            createdAt: true,
            updatedAt: true,
            closedAt: true,
            firstResponseAt: true,
            jarvisRepliedAt: true,
            lastMentorCallAt: true,
            studentId: true,
            curatorId: true,
            student: { select: { id: true, fullName: true, email: true } },
            curator: { select: { id: true, fullName: true, email: true } },
          },
          orderBy: { createdAt: "desc" },
        });

        let open = 0;
        let closed = 0;
        let mentorCallsTotal = 0;

        // First touch (bot OR curator, whichever came first)
        let firstTouchSum = 0;
        let firstTouchN = 0;

        // Curator first response (human only)
        let firstRespSum = 0;
        let firstRespN = 0;

        let ratingSum = 0;
        let ratingN = 0;

        // Who was first responder
        let botOnly = 0;
        let mentorOnly = 0;
        let botThenMentor = 0;
        let mentorThenBot = 0;
        let noResponse = 0;

        const ratingDist = Array.from({ length: 10 }, (_, i) => ({ rating: i + 1, count: 0 }));
        const weekMap = new Map<string, number>();

        const perCuratorMap = new Map<string, {
          curatorId: string;
          name: string;
          taken: number;
          closed: number;
          firstRespSum: number;
          firstRespN: number;
          ratingSum: number;
          ratingN: number;
        }>();

        const studentMap = new Map<string, {
          id: string;
          name: string;
          email: string;
          total: number;
          openCount: number;
          ratingSum: number;
          ratingN: number;
          mentorCalls: number;
          lastQuestionAt: Date;
        }>();

        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        let lastWeekCount = 0;

        for (const q of questions) {
          // Status
          if (q.status === "closed" || q.status === "answered") closed++;
          else open++;

          if (q.createdAt >= weekAgo) lastWeekCount++;

          // First touch (min of bot and curator)
          const botMs = q.jarvisRepliedAt?.getTime() ?? null;
          const humanMs = q.firstResponseAt?.getTime() ?? null;
          const firstTouchMs =
            botMs !== null && humanMs !== null
              ? Math.min(botMs, humanMs)
              : botMs ?? humanMs;
          if (firstTouchMs !== null) {
            const diff = (firstTouchMs - q.createdAt.getTime()) / 1000;
            if (diff >= 0) { firstTouchSum += diff; firstTouchN++; }
          }

          // Curator (human) first response
          if (q.firstResponseAt) {
            const diff = (q.firstResponseAt.getTime() - q.createdAt.getTime()) / 1000;
            if (diff >= 0) { firstRespSum += diff; firstRespN++; }
          }

          // First responder category
          if (q.jarvisRepliedAt && q.firstResponseAt) {
            if (q.jarvisRepliedAt <= q.firstResponseAt) botThenMentor++;
            else mentorThenBot++;
          } else if (q.jarvisRepliedAt) {
            botOnly++;
          } else if (q.firstResponseAt) {
            mentorOnly++;
          } else {
            noResponse++;
          }

          if (q.lastMentorCallAt) mentorCallsTotal++;

          // Rating
          if (q.rating != null) {
            ratingSum += q.rating;
            ratingN++;
            if (q.rating >= 1 && q.rating <= 10) ratingDist[q.rating - 1].count++;
          }

          // Per curator
          if (q.curator) {
            const k = q.curator.id;
            if (!perCuratorMap.has(k)) {
              perCuratorMap.set(k, {
                curatorId: k,
                name: q.curator.fullName || q.curator.email,
                taken: 0, closed: 0,
                firstRespSum: 0, firstRespN: 0,
                ratingSum: 0, ratingN: 0,
              });
            }
            const c = perCuratorMap.get(k)!;
            c.taken++;
            if (q.status === "closed" || q.status === "answered") c.closed++;
            if (q.firstResponseAt) {
              const diff = (q.firstResponseAt.getTime() - q.createdAt.getTime()) / 1000;
              if (diff >= 0) { c.firstRespSum += diff; c.firstRespN++; }
            }
            if (q.rating != null) { c.ratingSum += q.rating; c.ratingN++; }
          }

          // Per week (ISO Monday)
          const d = new Date(q.createdAt);
          const day = d.getUTCDay() || 7;
          d.setUTCHours(0, 0, 0, 0);
          d.setUTCDate(d.getUTCDate() - day + 1);
          const weekKey = d.toISOString().slice(0, 10);
          weekMap.set(weekKey, (weekMap.get(weekKey) ?? 0) + 1);

          // Per student
          const isOpen = q.status === "open" || q.status === "in_progress";
          const existing = studentMap.get(q.studentId);
          if (!existing) {
            studentMap.set(q.studentId, {
              id: q.student.id,
              name: q.student.fullName || q.student.email,
              email: q.student.email,
              total: 1,
              openCount: isOpen ? 1 : 0,
              ratingSum: q.rating ?? 0,
              ratingN: q.rating != null ? 1 : 0,
              mentorCalls: q.lastMentorCallAt ? 1 : 0,
              lastQuestionAt: q.createdAt,
            });
          } else {
            existing.total++;
            if (isOpen) existing.openCount++;
            if (q.rating != null) { existing.ratingSum += q.rating; existing.ratingN++; }
            if (q.lastMentorCallAt) existing.mentorCalls++;
            if (q.createdAt > existing.lastQuestionAt) existing.lastQuestionAt = q.createdAt;
          }
        }

        const perCurator = Array.from(perCuratorMap.values())
          .map((c) => ({
            curatorId: c.curatorId,
            name: c.name,
            taken: c.taken,
            closed: c.closed,
            avgFirstResponseSec: c.firstRespN > 0 ? Math.round(c.firstRespSum / c.firstRespN) : null,
            avgRating: c.ratingN > 0 ? +(c.ratingSum / c.ratingN).toFixed(2) : null,
          }))
          .sort((a, b) => b.taken - a.taken);

        const perStudent = Array.from(studentMap.values())
          .map((s) => ({
            studentId: s.id,
            name: s.name,
            email: s.email,
            questionCount: s.total,
            openCount: s.openCount,
            avgRating: s.ratingN > 0 ? +(s.ratingSum / s.ratingN).toFixed(1) : null,
            mentorCalls: s.mentorCalls,
            lastQuestionAt: s.lastQuestionAt.toISOString(),
          }))
          .sort((a, b) => b.questionCount - a.questionCount);

        const perWeek = Array.from(weekMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([weekStart, count]) => ({ weekStart, count }));

        return NextResponse.json<ApiResponse>({
          success: true,
          data: {
            // Summary
            totalQuestions: questions.length,
            lastWeekCount,
            open,
            closed,
            mentorCallsTotal,
            // Response times
            avgFirstTouchSec: firstTouchN > 0 ? Math.round(firstTouchSum / firstTouchN) : null,
            avgFirstResponseSec: firstRespN > 0 ? Math.round(firstRespSum / firstRespN) : null,
            // Ratings
            avgRating: ratingN > 0 ? +(ratingSum / ratingN).toFixed(1) : null,
            ratingDistribution: ratingDist,
            // First responder
            firstResponder: { botOnly, mentorOnly, botThenMentor, mentorThenBot, noResponse },
            // Breakdowns
            perCurator,
            perStudent,
            perWeek,
          },
        });
      } catch (error) {
        console.error("Questions analytics error:", error);
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "INTERNAL_ERROR", message: "Не удалось получить аналитику по вопросам" } },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
