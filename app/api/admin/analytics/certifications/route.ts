/**
 * app/api/admin/analytics/certifications/route.ts
 *
 * Аналитика по сертификационным анкетам (Lesson.type = "certification_form").
 *
 * Каждая попытка студента — это HomeworkSubmission, ссылающийся на Lesson
 * соответствующего типа. content внутри HomeworkSubmission — JSON-строка
 * вида:
 *   {
 *     "_answers": { "<текст вопроса>": "<ответ>", ... },
 *     "_test_score": 8,
 *     "_test_total": 10
 *   }
 *
 * Endpoint отдаёт:
 *   • items        — список сабмишенов с распаршенными ответами
 *   • summary      — сводка по статусам, средний балл, по курсам, по неделям
 *   • filters      — справочники для селектов (курсы, группы)
 *
 * Фильтры (query):
 *   range    — 7d / 30d / 90d / all (по createdAt)
 *   courseId — фильтр по курсу
 *   groupId  — фильтр по группе студента (GroupMember.userId)
 *   status   — pending / approved / rejected
 *   search   — поиск по ФИО/email студента (case-insensitive)
 *
 * Только админ.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { HomeworkStatus, UserRole } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Период по createdAt. */
function rangeToFromDate(range: string | null): Date | null {
  switch (range) {
    case "7d":
      return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    case "90d":
      return new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    case "all":
    case null:
    case "":
      return null;
    default:
      return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  }
}

interface ParsedContent {
  answers: Array<{ question: string; answer: string }>;
  testScore: number | null;
  testTotal: number | null;
}

function parseSubmissionContent(raw: string | null): ParsedContent {
  if (!raw) return { answers: [], testScore: null, testTotal: null };
  try {
    const obj = JSON.parse(raw);
    const answersObj =
      obj && typeof obj === "object" && obj._answers && typeof obj._answers === "object"
        ? (obj._answers as Record<string, unknown>)
        : {};
    const answers = Object.entries(answersObj).map(([q, a]) => ({
      question: String(q),
      // Ответы могут быть строкой или числом — приводим к строке.
      answer: a === null || a === undefined ? "" : String(a),
    }));
    return {
      answers,
      testScore:
        typeof obj?._test_score === "number" ? obj._test_score : null,
      testTotal:
        typeof obj?._test_total === "number" ? obj._test_total : null,
    };
  } catch {
    // Сабмишен мог сохраниться как plain text — в этом случае показываем
    // целиком в одной «ответной» паре.
    return {
      answers: [{ question: "Ответ", answer: raw }],
      testScore: null,
      testTotal: null,
    };
  }
}

/** Week-bucket "YYYY-MM-DD" (понедельник недели). */
function weekKey(d: Date): string {
  const day = d.getUTCDay() || 7; // 1..7, Monday=1
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - (day - 1));
  monday.setUTCHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  return withAuth(
    req,
    async () => {
      const url = new URL(req.url);
      const range = url.searchParams.get("range");
      const courseId = url.searchParams.get("courseId") || undefined;
      const groupId = url.searchParams.get("groupId") || undefined;
      const statusParam = url.searchParams.get("status");
      const search = (url.searchParams.get("search") || "").trim();

      const fromDate = rangeToFromDate(range);

      // ── Список userIds в группе (если задан фильтр по группе). ──────────
      let userIdsInGroup: string[] | null = null;
      if (groupId) {
        const members = await db.groupMember.findMany({
          where: { groupId },
          select: { userId: true },
        });
        userIdsInGroup = members.map((m) => m.userId);
        // Пустая группа — сразу пустой ответ.
        if (userIdsInGroup.length === 0) {
          return NextResponse.json({
            success: true,
            data: {
              items: [],
              summary: emptySummary(),
              filters: await loadFilterDictionaries(),
            },
          });
        }
      }

      // ── Допустимые статусы фильтра. ─────────────────────────────────────
      let status: HomeworkStatus | undefined;
      if (
        statusParam === "pending" ||
        statusParam === "approved" ||
        statusParam === "rejected"
      ) {
        status = statusParam as HomeworkStatus;
      }

      // ── Основной запрос. ────────────────────────────────────────────────
      // Фильтруем по lesson.type=certification_form, диапазону, статусу,
      // курсу (через lesson.module.course), группе (через списка userIds),
      // поиску по студенту.
      const items = await db.homeworkSubmission.findMany({
        where: {
          status,
          ...(fromDate ? { createdAt: { gte: fromDate } } : {}),
          ...(userIdsInGroup ? { userId: { in: userIdsInGroup } } : {}),
          ...(search
            ? {
                user: {
                  OR: [
                    { fullName: { contains: search, mode: "insensitive" } },
                    { email: { contains: search, mode: "insensitive" } },
                  ],
                },
              }
            : {}),
          lesson: {
            type: "certification_form",
            ...(courseId
              ? { module: { courseId } }
              : {}),
          },
        },
        select: {
          id: true,
          status: true,
          content: true,
          curatorComment: true,
          createdAt: true,
          reviewedAt: true,
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              groupMembers: {
                select: { group: { select: { id: true, name: true } } },
                take: 3, // студент обычно в 1 группе, но защитимся
              },
            },
          },
          lesson: {
            select: {
              id: true,
              title: true,
              module: {
                select: {
                  id: true,
                  title: true,
                  course: { select: { id: true, title: true } },
                },
              },
            },
          },
          curator: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        // Топ 2000 — больше за раз в админке смотреть всё равно неудобно;
        // если базы вырастут — добавим серверную пагинацию.
        take: 2000,
      });

      // ── Маппинг + парсинг content. ──────────────────────────────────────
      const mapped = items.map((it) => {
        const parsed = parseSubmissionContent(it.content);
        const groups = it.user?.groupMembers?.map((gm) => gm.group) ?? [];
        return {
          id: it.id,
          status: it.status,
          createdAt: it.createdAt.toISOString(),
          reviewedAt: it.reviewedAt?.toISOString() ?? null,
          curatorComment: it.curatorComment,
          student: it.user
            ? {
                id: it.user.id,
                fullName: it.user.fullName,
                email: it.user.email,
                groups,
              }
            : null,
          lesson: it.lesson
            ? {
                id: it.lesson.id,
                title: it.lesson.title,
                module: it.lesson.module
                  ? {
                      id: it.lesson.module.id,
                      title: it.lesson.module.title,
                      course: it.lesson.module.course,
                    }
                  : null,
              }
            : null,
          curator: it.curator,
          answers: parsed.answers,
          testScore: parsed.testScore,
          testTotal: parsed.testTotal,
        };
      });

      // ── Сводка. ─────────────────────────────────────────────────────────
      const summary = {
        total: mapped.length,
        byStatus: {
          pending: 0,
          approved: 0,
          rejected: 0,
        } as Record<HomeworkStatus, number>,
        /** Средний % правильных ответов тестовой части (если есть). */
        avgScorePercent: null as number | null,
        /** Сколько сабмишенов имели тест-балл (для понимания репрезентативности). */
        scoredCount: 0,
        /** Топ-5 курсов по числу сабмишенов. */
        byCourse: [] as Array<{
          courseId: string;
          courseTitle: string;
          count: number;
          approved: number;
          rejected: number;
          pending: number;
        }>,
        /** Динамика по неделям (Monday-anchored). */
        byWeek: [] as Array<{ week: string; count: number }>,
      };

      let scoreSumPct = 0;
      const byCourseMap = new Map<
        string,
        {
          courseId: string;
          courseTitle: string;
          count: number;
          approved: number;
          rejected: number;
          pending: number;
        }
      >();
      const byWeekMap = new Map<string, number>();

      for (const m of mapped) {
        summary.byStatus[m.status] = (summary.byStatus[m.status] ?? 0) + 1;
        if (m.testScore !== null && m.testTotal && m.testTotal > 0) {
          scoreSumPct += (m.testScore / m.testTotal) * 100;
          summary.scoredCount++;
        }
        const c = m.lesson?.module?.course;
        if (c) {
          const k = c.id;
          const existing =
            byCourseMap.get(k) ?? {
              courseId: c.id,
              courseTitle: c.title,
              count: 0,
              approved: 0,
              rejected: 0,
              pending: 0,
            };
          existing.count++;
          existing[m.status as "approved" | "rejected" | "pending"]++;
          byCourseMap.set(k, existing);
        }
        const wk = weekKey(new Date(m.createdAt));
        byWeekMap.set(wk, (byWeekMap.get(wk) ?? 0) + 1);
      }

      summary.avgScorePercent =
        summary.scoredCount > 0
          ? Math.round((scoreSumPct / summary.scoredCount) * 10) / 10
          : null;
      summary.byCourse = Array.from(byCourseMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
      summary.byWeek = Array.from(byWeekMap.entries())
        .map(([week, count]) => ({ week, count }))
        .sort((a, b) => a.week.localeCompare(b.week));

      // ── Справочники для UI-фильтров. ────────────────────────────────────
      const filters = await loadFilterDictionaries();

      return NextResponse.json({
        success: true,
        data: { items: mapped, summary, filters },
      });
    },
    { roles: [UserRole.admin] }
  );
}

function emptySummary() {
  return {
    total: 0,
    byStatus: { pending: 0, approved: 0, rejected: 0 },
    avgScorePercent: null as number | null,
    scoredCount: 0,
    byCourse: [],
    byWeek: [],
  };
}

/**
 * Грузит справочники курсов (только те, у которых есть хоть один урок
 * certification_form) и групп. Списки короткие, без пагинации.
 */
async function loadFilterDictionaries() {
  const courses = await db.course.findMany({
    where: {
      modules: {
        some: {
          lessons: { some: { type: "certification_form" } },
        },
      },
    },
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });
  const groups = await db.group.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return { courses, groups };
}
