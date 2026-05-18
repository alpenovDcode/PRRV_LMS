import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";

const AI_CHECKER_URL = process.env.AI_CHECKER_URL || "http://localhost:3000";
const AI_CHECKER_KEY = process.env.AI_CHECKER_KEY || "";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async () => {
      const { id } = await params;

      const submission = await db.homeworkSubmission.findUnique({
        where: { id },
        include: {
          user: { select: { fullName: true, email: true } },
          lesson: {
            select: {
              title: true,
              content: true,
              aiPrompt: true,
              aiContext: true,
              hasImageAnalysis: true,
            },
          },
        },
      });

      if (!submission) {
        return NextResponse.json({ error: "Не найдено" }, { status: 404 });
      }

      if (!submission.lesson?.aiPrompt) {
        return NextResponse.json(
          { error: "Для этого урока не настроен AI-промпт" },
          { status: 422 }
        );
      }

      const lesson = submission.lesson;
      const resp = await fetch(`${AI_CHECKER_URL}/api/homework/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": AI_CHECKER_KEY,
        },
        body: JSON.stringify({
          studentAnswer: submission.content ?? "",
          aiPrompt: lesson.aiPrompt,
          aiContext: lesson.aiContext ?? null,
          imageFiles: lesson.hasImageAnalysis
            ? ((submission.files as string[]) || [])
            : [],
          lessonTitle: lesson.title,
          lessonContent: lesson.content ?? null,
          studentName: submission.user.fullName ?? submission.user.email,
        }),
        signal: AbortSignal.timeout(300_000),
      });

      if (!resp.ok) {
        const text = await resp.text();
        return NextResponse.json(
          { error: `Ошибка анализа: ${text.slice(0, 200)}` },
          { status: 502 }
        );
      }

      const result = await resp.json();

      // Сохраняем анализ в БД — виден только куратору, студенту не отправляется
      await db.homeworkSubmission.update({
        where: { id },
        data: {
          aiSuggestedVerdict: result.verdict,
          aiSuggestedComment: result.comment,
          aiAnalyzedAt: new Date(),
        } as any,
      });

      return NextResponse.json({
        ok: true,
        verdict: result.verdict,
        comment: result.comment,
      });
    },
    { roles: [UserRole.curator, UserRole.admin] }
  );
}
