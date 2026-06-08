import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";

function parseAnswers(content: string | null): Record<string, string> | null {
  if (!content) return null;
  try {
    const parsed = JSON.parse(content);
    // Structured format: { _answers: { "question": "answer" } }
    if (parsed && typeof parsed === "object" && parsed._answers) {
      return parsed._answers;
    }
  } catch {}
  // Fallback: treat raw content as a single freeform answer
  const trimmed = content.trim();
  if (trimmed) return { "Ответ": trimmed };
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  return withAuth(
    request,
    async () => {
      try {
        const { lessonId } = await params;

        const lesson = await db.lesson.findUnique({
          where: { id: lessonId },
          select: {
            id: true,
            title: true,
            homework: {
              where: { status: { not: "rejected" }, lessonId: { not: null } },
              select: {
                id: true,
                content: true,
                createdAt: true,
                userId: true,
                user: {
                  select: {
                    id: true,
                    fullName: true,
                    email: true,
                    groupMembers: {
                      select: { group: { select: { id: true, name: true } } },
                    },
                  },
                },
              },
              orderBy: { createdAt: "desc" },
            },
          },
        });

        if (!lesson) {
          return NextResponse.json<ApiResponse>(
            { success: false, error: { code: "NOT_FOUND", message: "Урок не найден" } },
            { status: 404 }
          );
        }

        // Collect all unique questions across all submissions
        const questionOrder = new Map<string, number>();
        for (const sub of lesson.homework) {
          const answers = parseAnswers(sub.content);
          if (!answers) continue;
          for (const q of Object.keys(answers)) {
            if (!questionOrder.has(q)) questionOrder.set(q, questionOrder.size);
          }
        }
        const questions = Array.from(questionOrder.keys());

        // Collect unique groups
        const groupMap = new Map<string, string>();
        for (const sub of lesson.homework) {
          const g = sub.user.groupMembers[0]?.group;
          if (g && !groupMap.has(g.id)) groupMap.set(g.id, g.name);
        }
        const groups = Array.from(groupMap.entries()).map(([id, name]) => ({ id, name }));
        groups.sort((a, b) => a.name.localeCompare(b.name));

        // Build per-user response rows
        const responses = lesson.homework.map((sub) => {
          const group = sub.user.groupMembers[0]?.group ?? { id: "no-group", name: "Без группы" };
          const answers = parseAnswers(sub.content) ?? {};
          return {
            userId: sub.user.id,
            userName: sub.user.fullName || sub.user.email,
            userEmail: sub.user.email,
            groupId: group.id,
            groupName: group.name,
            submittedAt: sub.createdAt,
            answers,
          };
        });

        return NextResponse.json<ApiResponse>({
          success: true,
          data: {
            lessonId: lesson.id,
            lessonTitle: lesson.title,
            questions,
            groups,
            responses,
          },
        });
      } catch (error) {
        console.error("Survey responses error:", error);
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "INTERNAL_ERROR", message: "Не удалось получить ответы" } },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
