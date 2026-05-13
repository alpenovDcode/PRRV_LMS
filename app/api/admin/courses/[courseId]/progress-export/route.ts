// CSV export of per-user course progress.
// Columns: identity, enrollment, summary (completed/total/percent),
// last completed lesson, current (first unfinished) lesson, last activity.
//
// Optional ?detailed=true adds one column per lesson with the status
// for that user — useful when admins want a full pivot. Off by default
// because course with 50+ lessons makes the CSV unwieldy.

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  completed: "завершён",
  in_progress: "в процессе",
  not_started: "не начат",
  failed: "провален",
};

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

function fmtDateTime(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().slice(0, 16).replace("T", " ");
}

export async function GET(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ courseId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async (req) => {
      const url = new URL(req.url);
      const detailed = url.searchParams.get("detailed") === "true";

      const course = await db.course.findUnique({
        where: { id: params.courseId },
        select: {
          id: true,
          title: true,
          slug: true,
          modules: {
            orderBy: { orderIndex: "asc" },
            select: {
              id: true,
              title: true,
              orderIndex: true,
              lessons: {
                orderBy: { orderIndex: "asc" },
                select: { id: true, title: true, orderIndex: true },
              },
            },
          },
        },
      });
      if (!course) {
        return new Response("Course not found", { status: 404 });
      }

      // Flatten lessons into a single ordered list; remember each one's
      // position number for use in the "currentLesson" / "lastCompleted"
      // strings.
      const orderedLessons = course.modules.flatMap((m) =>
        m.lessons.map((l) => ({
          ...l,
          moduleTitle: m.title,
        }))
      );
      const lessonsWithPosition = orderedLessons.map((l, i) => ({
        ...l,
        position: i + 1,
      }));
      const lessonIds = lessonsWithPosition.map((l) => l.id);

      const enrollments = await db.enrollment.findMany({
        where: { courseId: params.courseId },
        orderBy: { createdAt: "desc" },
        select: {
          userId: true,
          status: true,
          startDate: true,
          expiresAt: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              role: true,
              tariff: true,
              isBlocked: true,
              lastActiveAt: true,
            },
          },
        },
      });

      // One query for everyone's progress on this course.
      const userIds = enrollments.map((e) => e.userId);
      const progressRows =
        lessonIds.length > 0 && userIds.length > 0
          ? await db.lessonProgress.findMany({
              where: {
                userId: { in: userIds },
                lessonId: { in: lessonIds },
              },
              select: {
                userId: true,
                lessonId: true,
                status: true,
                watchedTime: true,
                completedAt: true,
                lastUpdated: true,
              },
            })
          : [];

      // Index for O(1) lookup.
      const progressIdx = new Map<string, (typeof progressRows)[number]>();
      for (const p of progressRows) {
        progressIdx.set(`${p.userId}::${p.lessonId}`, p);
      }

      const baseHeader = [
        "Имя",
        "Email",
        "Роль",
        "Тариф",
        "Зачислен",
        "Доступ до",
        "Статус доступа",
        "Заблокирован",
        "Уроков завершено",
        "Всего уроков",
        "% прогресса",
        "Последний завершённый урок",
        "Текущий урок",
        "Последняя активность",
      ];
      const detailedHeader = lessonsWithPosition.map(
        (l) => `${l.position}. ${l.title}`
      );
      const header = detailed ? [...baseHeader, ...detailedHeader] : baseHeader;

      const lines: string[] = [csvRow(header)];

      for (const e of enrollments) {
        const userId = e.userId;
        const perLesson = lessonsWithPosition.map((l) => {
          const p = progressIdx.get(`${userId}::${l.id}`);
          return {
            lesson: l,
            status: p?.status ?? "not_started",
            lastUpdated: p?.lastUpdated ?? null,
            completedAt: p?.completedAt ?? null,
          };
        });

        const completed = perLesson.filter((x) => x.status === "completed");
        const total = perLesson.length;
        const percent =
          total > 0 ? Math.round((completed.length / total) * 100) : 0;
        const lastCompleted = [...completed].sort(
          (a, b) =>
            (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0)
        )[0];
        const currentLesson =
          perLesson.find((x) => x.status !== "completed") ?? null;
        const lastActivity = perLesson.reduce<Date | null>((max, x) => {
          if (!x.lastUpdated) return max;
          return !max || x.lastUpdated > max ? x.lastUpdated : max;
        }, null);

        const row: unknown[] = [
          e.user.fullName ?? "",
          e.user.email,
          e.user.role,
          e.user.tariff ?? "",
          fmtDate(e.startDate),
          fmtDate(e.expiresAt),
          e.status,
          e.user.isBlocked ? "да" : "нет",
          completed.length,
          total,
          `${percent}%`,
          lastCompleted
            ? `${lastCompleted.lesson.position}. ${lastCompleted.lesson.title}`
            : "—",
          currentLesson
            ? `${currentLesson.lesson.position}. ${currentLesson.lesson.title}`
            : "Завершён",
          fmtDateTime(lastActivity),
        ];

        if (detailed) {
          for (const p of perLesson) {
            row.push(STATUS_LABEL[p.status] ?? p.status);
          }
        }

        lines.push(csvRow(row));
      }

      // BOM so Excel opens UTF-8 with Cyrillic correctly.
      const csv = "﻿" + lines.join("\r\n");

      const filename = `progress_${course.slug || course.id}_${new Date()
        .toISOString()
        .slice(0, 10)}${detailed ? "_detailed" : ""}.csv`;

      return new Response(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
            filename
          )}`,
          "Cache-Control": "no-store",
        },
      });
    },
    { roles: ["admin"] }
  );
}
