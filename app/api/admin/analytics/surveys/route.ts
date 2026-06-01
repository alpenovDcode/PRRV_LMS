import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";

// NPS calculation: promoters (9-10), detractors (0-6), neutrals (7-8)
// NPS = (promoters - detractors) / total * 100
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

// Extract a single numeric score (0-10) from free-text homework content.
// Handles: "8", "9/10", "Оценка: 8", "я бы поставил 9 из 10" etc.
function extractScoreFromText(content: string | null): number | null {
  if (!content) return null;
  // Try JSON structured first
  const answers = parseAnswers(content);
  if (answers) {
    for (const value of Object.values(answers)) {
      const num = parseFloat(value);
      if (!isNaN(num) && num >= 0 && num <= 10) return num;
    }
  }
  // Fall back to plain text: find first integer 0-10
  const match = content.match(/\b(10|[0-9])\b/);
  if (match) {
    const num = parseInt(match[1], 10);
    if (num >= 0 && num <= 10) return num;
  }
  return null;
}

// Find a numeric score in answers by partial key match
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

export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      try {
        // Shared select for homework submissions with user's group info
        const homeworkSelect = {
          where: { status: { not: "rejected" as const }, lessonId: { not: null } },
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

        // === 1. Intermediate surveys ===
        const surveyLessons = await db.lesson.findMany({
          where: { type: "intermediate_survey" },
          select: { id: true, title: true, homework: homeworkSelect },
        });

        // === 2. Certification form lessons ===
        const certLessons = await db.lesson.findMany({
          where: { type: "certification_form" },
          select: { id: true, title: true, homework: homeworkSelect },
        });

        // === 3. Title-based freeform rating lessons (text type: онбординг, стратсессия etc.) ===
        const titleSurveyLessons = await db.lesson.findMany({
          where: {
            type: { not: "intermediate_survey" },
            OR: [
              { title: { contains: "онбординг", mode: "insensitive" } },
              { title: { contains: "стратсессия", mode: "insensitive" } },
              { title: { contains: "страт", mode: "insensitive" } },
            ],
          },
          select: { id: true, title: true, homework: homeworkSelect },
        });

        // === 4. Build freeform (plain text) survey results ===
        const buildFreeformResults = (lessons: typeof titleSurveyLessons) => {
          return lessons.map((lesson) => {
            const groupMap = new Map<string, { groupName: string; scores: number[] }>();

            for (const sub of lesson.homework) {
              const score = extractScoreFromText(sub.content);
              if (score === null) continue;

              const groups = sub.user.groupMembers.map((gm) => gm.group);
              const group = groups.length > 0 ? groups[0] : { id: "no-group", name: "Без группы" };

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

            return {
              lessonId: lesson.id,
              lessonTitle: lesson.title,
              totalResponses: lesson.homework.length,
              parsedResponses: groupResults.reduce((s, g) => s + g.responseCount, 0),
              groups: groupResults,
            };
          });
        };

        // === 5. Build survey results ===
        const buildGroupedResults = (lessons: typeof surveyLessons, npsKeywords: string[]) => {
          return lessons.map((lesson) => {
            // Map: groupId -> { groupName, scores, satisfactionSums, responseCounts }
            const groupMap = new Map<
              string,
              {
                groupName: string;
                npsScores: number[];
                scaleSums: Record<string, { sum: number; count: number }>;
              }
            >();

            for (const sub of lesson.homework) {
              const answers = parseAnswers(sub.content);
              if (!answers) continue;

              const groups = sub.user.groupMembers.map((gm) => gm.group);
              // Use first group (or "Без группы")
              const group =
                groups.length > 0
                  ? groups[0]
                  : { id: "no-group", name: "Без группы" };

              if (!groupMap.has(group.id)) {
                groupMap.set(group.id, {
                  groupName: group.name,
                  npsScores: [],
                  scaleSums: {},
                });
              }
              const entry = groupMap.get(group.id)!;

              // Extract NPS score
              const npsScore = findScore(answers, ...npsKeywords);
              if (npsScore !== null) entry.npsScores.push(npsScore);

              // Extract all scale questions (numeric 0-10 or 1-10 answers)
              for (const [qText, value] of Object.entries(answers)) {
                const num = parseFloat(value);
                if (!isNaN(num) && num >= 0 && num <= 10) {
                  // Skip NPS question
                  const isNpsQ = npsKeywords.some((kw) =>
                    qText.toLowerCase().includes(kw.toLowerCase())
                  );
                  if (!isNpsQ) {
                    if (!entry.scaleSums[qText]) {
                      entry.scaleSums[qText] = { sum: 0, count: 0 };
                    }
                    entry.scaleSums[qText].sum += num;
                    entry.scaleSums[qText].count += 1;
                  }
                }
              }
            }

            const groupResults = Array.from(groupMap.entries()).map(
              ([groupId, data]) => {
                const npsResult = calcNPS(data.npsScores);
                const avgScores: Record<string, number> = {};
                for (const [q, { sum, count }] of Object.entries(data.scaleSums)) {
                  avgScores[q] = Math.round((sum / count) * 10) / 10;
                }
                return {
                  groupId,
                  groupName: data.groupName,
                  responseCount: lesson.homework.filter((s) =>
                    s.user.groupMembers.some((gm) => gm.group.id === groupId)
                  ).length,
                  ...npsResult,
                  avgScores,
                };
              }
            );

            return {
              lessonId: lesson.id,
              lessonTitle: lesson.title,
              totalResponses: lesson.homework.length,
              groups: groupResults,
            };
          });
        };

        const intermediateSurveys = buildGroupedResults(surveyLessons, [
          "порекомендуете",
          "порекомендовать",
          "recommend",
        ]);

        const freeformSurveys = buildFreeformResults(titleSurveyLessons);

        // Certification: extract specific satisfaction scores
        const certResults = certLessons.map((lesson) => {
          const groupMap = new Map<
            string,
            {
              groupName: string;
              npsScores: number[];
              mentorScores: number[];
              curatorScores: number[];
              clubScores: number[];
              psychScores: number[];
              botScores: number[];
              resultsScores: number[];
            }
          >();

          for (const sub of lesson.homework) {
            const answers = parseAnswers(sub.content);
            if (!answers) continue;

            const groups = sub.user.groupMembers.map((gm) => gm.group);
            const group =
              groups.length > 0
                ? groups[0]
                : { id: "no-group", name: "Без группы" };

            if (!groupMap.has(group.id)) {
              groupMap.set(group.id, {
                groupName: group.name,
                npsScores: [],
                mentorScores: [],
                curatorScores: [],
                clubScores: [],
                psychScores: [],
                botScores: [],
                resultsScores: [],
              });
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
            arr.length > 0
              ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10
              : null;

          const groupResults = Array.from(groupMap.entries()).map(([groupId, data]) => ({
            groupId,
            groupName: data.groupName,
            responseCount: lesson.homework.filter((s) =>
              s.user.groupMembers.some((gm) => gm.group.id === groupId)
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

          return {
            lessonId: lesson.id,
            lessonTitle: lesson.title,
            totalResponses: lesson.homework.length,
            groups: groupResults,
          };
        });

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: {
              freeformSurveys,
              intermediateSurveys,
              certificationForms: certResults,
            },
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("Analytics surveys error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось получить аналитику по опросам",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
