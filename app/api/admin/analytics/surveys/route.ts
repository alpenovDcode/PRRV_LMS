import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { format } from "date-fns";
import { rangeToFromDate } from "@/lib/analytics-range";

function calcNPS(scores: number[]): { nps: number | null; promoters: number; detractors: number; neutrals: number; total: number } {
  const total = scores.length;
  if (total === 0) return { nps: null, promoters: 0, detractors: 0, neutrals: 0, total: 0 };
  const promoters = scores.filter((s) => s >= 9).length;
  const detractors = scores.filter((s) => s <= 6).length;
  const neutrals = scores.filter((s) => s === 7 || s === 8).length;
  const nps = Math.round(((promoters - detractors) / total) * 100);
  return { nps, promoters, detractors, neutrals, total };
}

function parseAnswers(content: string | null): Record<string, string> | null {
  if (!content) return null;
  try {
    const parsed = JSON.parse(content);
    return parsed._answers ?? null;
  } catch {
    return null;
  }
}

function extractScoreFromText(content: string | null): number | null {
  if (!content) return null;
  const answers = parseAnswers(content);
  if (answers) {
    for (const value of Object.values(answers)) {
      const num = parseFloat(value);
      if (!isNaN(num) && num >= 0 && num <= 10) return num;
    }
  }
  const match = content.match(/\b(10|[0-9])\b/);
  if (match) {
    const num = parseInt(match[1], 10);
    if (num >= 0 && num <= 10) return num;
  }
  return null;
}

// Build per-month NPS history from structured submissions
function buildMonthlyNPS(
  submissions: Array<{ content: string | null; createdAt: Date | string }>,
  npsKeywords: string[]
): Array<{ month: string; nps: number | null; total: number }> {
  const monthMap = new Map<string, number[]>();
  for (const sub of submissions) {
    const answers = parseAnswers(sub.content);
    if (!answers) continue;
    const score = findScoreFromAnswers(answers, ...npsKeywords);
    if (score === null) continue;
    const month = format(new Date(sub.createdAt), "yyyy-MM");
    if (!monthMap.has(month)) monthMap.set(month, []);
    monthMap.get(month)!.push(score);
  }
  return Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, scores]) => ({ month, ...calcNPS(scores) }));
}

function buildMonthlyAvgScore(
  submissions: Array<{ content: string | null; createdAt: Date | string }>
): Array<{ month: string; avgScore: number | null; total: number }> {
  const monthMap = new Map<string, number[]>();
  for (const sub of submissions) {
    const score = extractScoreFromText(sub.content);
    if (score === null) continue;
    const month = format(new Date(sub.createdAt), "yyyy-MM");
    if (!monthMap.has(month)) monthMap.set(month, []);
    monthMap.get(month)!.push(score);
  }
  return Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, scores]) => ({
      month,
      total: scores.length,
      avgScore: scores.length > 0
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
        : null,
    }));
}

// Renamed internal version used by buildMonthlyNPS before findScore is defined
function findScoreFromAnswers(answers: Record<string, string>, ...keywords: string[]): number | null {
  for (const [key, value] of Object.entries(answers)) {
    const k = key.toLowerCase();
    if (keywords.some((kw) => k.includes(kw.toLowerCase()))) {
      const num = parseFloat(value);
      if (!isNaN(num)) return num;
    }
  }
  return null;
}

function findScore(answers: Record<string, string>, ...keywords: string[]): number | null {
  for (const [key, value] of Object.entries(answers)) {
    const k = key.toLowerCase();
    if (keywords.some((kw) => k.includes(kw.toLowerCase()))) {
      const num = parseFloat(value);
      if (!isNaN(num)) return num;
    }
  }
  return null;
}

type CourseGroup = { id: string; name: string };

function collectCourseGroups(course: {
  groups: CourseGroup[];
  enrollments?: Array<{ user: { groupMembers: Array<{ group: CourseGroup }> } }>;
}): CourseGroup[] {
  const seen = new Map<string, CourseGroup>();
  for (const g of course.groups) seen.set(g.id, g);
  for (const e of course.enrollments ?? []) {
    for (const gm of e.user.groupMembers) {
      if (!seen.has(gm.group.id)) seen.set(gm.group.id, gm.group);
    }
  }
  return Array.from(seen.values());
}

export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      try {
        const url = new URL(request.url);
        const range = url.searchParams.get("range") ?? "all";
        const fromDate = rangeToFromDate(range);

        const homeworkSelect = {
          where: {
            status: { not: "rejected" as const },
            lessonId: { not: null },
            ...(fromDate ? { createdAt: { gte: fromDate } } : {}),
          },
          select: {
            userId: true,
            content: true,
            createdAt: true,
            user: {
              select: {
                groupMembers: {
                  select: { group: { select: { id: true, name: true } } },
                },
              },
            },
          },
        } as const;

        // Include module → course → groups AND enrolled users' groups so ALL relevant groups appear
        const lessonSelect = {
          id: true,
          title: true,
          homework: homeworkSelect,
          module: {
            select: {
              course: {
                select: {
                  id: true,
                  title: true,
                  groups: {
                    select: { id: true, name: true },
                    orderBy: { name: "asc" as const },
                  },
                  enrollments: {
                    where: { status: "active" as const },
                    select: {
                      user: {
                        select: {
                          groupMembers: {
                            select: { group: { select: { id: true, name: true } } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        } as const;

        const [surveyLessons, certLessons, titleSurveyLessons] = await Promise.all([
          db.lesson.findMany({ where: { type: "intermediate_survey" }, select: lessonSelect }),
          db.lesson.findMany({ where: { type: "certification_form" }, select: lessonSelect }),
          db.lesson.findMany({
            where: {
              type: { not: "intermediate_survey" },
              OR: [
                { title: { contains: "онбординг", mode: "insensitive" } },
                { title: { contains: "стратсессия", mode: "insensitive" } },
                { title: { contains: "страт", mode: "insensitive" } },
              ],
            },
            select: lessonSelect,
          }),
        ]);

        // Factory-based seed: each group gets its OWN fresh object (spread shares references!)
        function seedGroupMap<T extends object>(
          courseGroups: CourseGroup[],
          factory: () => T
        ): Map<string, { groupName: string } & T> {
          const map = new Map<string, { groupName: string } & T>();
          for (const g of courseGroups) {
            map.set(g.id, { groupName: g.name, ...factory() });
          }
          return map;
        }

        // === Freeform (онбординг, стратсессия) ===
        const buildFreeformResults = (lessons: typeof titleSurveyLessons) => {
          return lessons.map((lesson) => {
            const courseGroups = lesson.module?.course ? collectCourseGroups(lesson.module.course) : [];
            const courseTitle = lesson.module?.course?.title;

            const groupMap = seedGroupMap(courseGroups, () => ({ scores: [] as number[] }));

            for (const sub of lesson.homework) {
              const score = extractScoreFromText(sub.content);
              if (score === null) continue;
              const groups = sub.user.groupMembers.map((gm) => gm.group);
              const group = groups[0] ?? { id: "no-group", name: "Без группы" };
              if (!groupMap.has(group.id)) {
                groupMap.set(group.id, { groupName: group.name, scores: [] });
              }
              groupMap.get(group.id)!.scores.push(score);
            }

            const groupResults = Array.from(groupMap.entries()).map(([groupId, data]) => ({
              groupId,
              groupName: data.groupName,
              responseCount: data.scores.length,
              avgScore: data.scores.length > 0
                ? Math.round((data.scores.reduce((a, b) => a + b, 0) / data.scores.length) * 10) / 10
                : null,
              ...calcNPS(data.scores),
            }));

            groupResults.sort((a, b) => b.responseCount - a.responseCount);

            return {
              lessonId: lesson.id,
              lessonTitle: lesson.title,
              courseTitle,
              totalResponses: lesson.homework.length,
              parsedResponses: groupResults.filter((g) => g.responseCount > 0).reduce((s, g) => s + g.responseCount, 0),
              groups: groupResults,
              history: buildMonthlyAvgScore(lesson.homework),
            };
          });
        };

        // === Intermediate surveys ===
        const buildGroupedResults = (lessons: typeof surveyLessons, npsKeywords: string[]) => {
          return lessons.map((lesson) => {
            const courseGroups = lesson.module?.course ? collectCourseGroups(lesson.module.course) : [];
            const courseTitle = lesson.module?.course?.title;

            const groupMap = seedGroupMap(courseGroups, () => ({
              npsScores: [] as number[],
              scaleSums: {} as Record<string, { sum: number; count: number }>,
            }));

            for (const sub of lesson.homework) {
              const answers = parseAnswers(sub.content);
              if (!answers) continue;
              const groups = sub.user.groupMembers.map((gm) => gm.group);
              const group = groups[0] ?? { id: "no-group", name: "Без группы" };
              if (!groupMap.has(group.id)) {
                groupMap.set(group.id, { groupName: group.name, npsScores: [], scaleSums: {} });
              }
              const entry = groupMap.get(group.id)!;
              const npsScore = findScore(answers, ...npsKeywords);
              if (npsScore !== null) entry.npsScores.push(npsScore);
              for (const [qText, value] of Object.entries(answers)) {
                const num = parseFloat(value);
                if (!isNaN(num) && num >= 0 && num <= 10) {
                  const isNpsQ = npsKeywords.some((kw) => qText.toLowerCase().includes(kw.toLowerCase()));
                  if (!isNpsQ) {
                    if (!entry.scaleSums[qText]) entry.scaleSums[qText] = { sum: 0, count: 0 };
                    entry.scaleSums[qText].sum += num;
                    entry.scaleSums[qText].count += 1;
                  }
                }
              }
            }

            const groupResults = Array.from(groupMap.entries()).map(([groupId, data]) => {
              const npsResult = calcNPS(data.npsScores);
              const avgScores: Record<string, number> = {};
              for (const [q, { sum, count }] of Object.entries(data.scaleSums)) {
                avgScores[q] = Math.round((sum / count) * 10) / 10;
              }
              return {
                groupId,
                groupName: data.groupName,
                responseCount: lesson.homework.filter((s) =>
                  s.user.groupMembers[0]?.group.id === groupId
                ).length,
                ...npsResult,
                avgScores,
              };
            });

            groupResults.sort((a, b) => b.responseCount - a.responseCount);

            return {
              lessonId: lesson.id,
              lessonTitle: lesson.title,
              courseTitle,
              totalResponses: lesson.homework.length,
              groups: groupResults,
              history: buildMonthlyNPS(lesson.homework, npsKeywords),
            };
          });
        };

        const intermediateSurveys = buildGroupedResults(surveyLessons, ["порекомендуете", "порекомендовать", "recommend"]);
        const freeformSurveys = buildFreeformResults(titleSurveyLessons);

        // === Certification forms ===
        const certResults = certLessons.map((lesson) => {
          const courseGroups = lesson.module?.course ? collectCourseGroups(lesson.module.course) : [];
          const courseTitle = lesson.module?.course?.title;

          const emptyEntry = () => ({
            npsScores: [] as number[],
            mentorScores: [] as number[],
            curatorScores: [] as number[],
            clubScores: [] as number[],
            psychScores: [] as number[],
            botScores: [] as number[],
            resultsScores: [] as number[],
          });

          const groupMap = new Map<string, { groupName: string } & ReturnType<typeof emptyEntry>>();
          for (const g of courseGroups) {
            groupMap.set(g.id, { groupName: g.name, ...emptyEntry() });
          }

          for (const sub of lesson.homework) {
            const answers = parseAnswers(sub.content);
            if (!answers) continue;
            const groups = sub.user.groupMembers.map((gm) => gm.group);
            const group = groups[0] ?? { id: "no-group", name: "Без группы" };
            if (!groupMap.has(group.id)) {
              groupMap.set(group.id, { groupName: group.name, ...emptyEntry() });
            }
            const entry = groupMap.get(group.id)!;
            for (const [qText, value] of Object.entries(answers)) {
              const num = parseFloat(value);
              if (isNaN(num)) continue;
              const q = qText.toLowerCase();
              if (q.includes("порекомендуете") || q.includes("порекомендовать")) {
                entry.npsScores.push(num);
              } else if (q.includes("наставника") && q.includes("удовлетворены")) {
                entry.mentorScores.push(num);
              } else if (q.includes("куратора") && q.includes("удовлетворены")) {
                entry.curatorScores.push(num);
              } else if (q.includes("клуба") || q.includes("мероприятиями")) {
                entry.clubScores.push(num);
              } else if (q.includes("психолог")) {
                entry.psychScores.push(num);
              } else if (q.includes("бот") && q.includes("заявк")) {
                entry.botScores.push(num);
              } else if (q.includes("результатами") && q.includes("удовлетворены")) {
                entry.resultsScores.push(num);
              }
            }
          }

          const avg = (arr: number[]) =>
            arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null;

          const groupResults = Array.from(groupMap.entries()).map(([groupId, data]) => ({
            groupId,
            groupName: data.groupName,
            responseCount: lesson.homework.filter((s) =>
              s.user.groupMembers[0]?.group.id === groupId
            ).length,
            ...calcNPS(data.npsScores),
            satisfaction: {
              mentor: avg(data.mentorScores),
              curator: avg(data.curatorScores),
              clubEvents: avg(data.clubScores),
              psychologist: avg(data.psychScores),
              bot: avg(data.botScores),
              results: avg(data.resultsScores),
            },
          }));

          groupResults.sort((a, b) => b.responseCount - a.responseCount);

          return {
            lessonId: lesson.id,
            lessonTitle: lesson.title,
            courseTitle,
            totalResponses: lesson.homework.length,
            groups: groupResults,
            history: buildMonthlyNPS(lesson.homework, ["порекомендуете", "порекомендовать"]),
          };
        });

        return NextResponse.json<ApiResponse>(
          { success: true, data: { freeformSurveys, intermediateSurveys, certificationForms: certResults } },
          { status: 200 }
        );
      } catch (error) {
        console.error("Analytics surveys error:", error);
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "INTERNAL_ERROR", message: "Не удалось получить аналитику по опросам" } },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
