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
      // 110s timeout — на 10s меньше ngrok-free лимита в 2 мин, чтобы
      // мы успели вернуть осмысленную ошибку до того как ngrok оборвёт
      // соединение. Платный AI-checker (без ngrok) при необходимости
      // обработает за это время; если нет — куратор увидит явный
      // timeout, а не молча зависнет.
      let resp: Response;
      try {
        resp = await fetch(`${AI_CHECKER_URL}/api/homework/analyze`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": AI_CHECKER_KEY,
            // Защита от ngrok-free interstitial-страницы. Если AI-checker
            // выставлен через ngrok-free, без этого хедера часть
            // запросов получает HTML вместо JSON и мы валимся в catch.
            "ngrok-skip-browser-warning": "true",
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
          signal: AbortSignal.timeout(110_000),
        });
      } catch (e) {
        // AbortError при таймауте AbortSignal.timeout(...).
        const isTimeout =
          (e instanceof Error && e.name === "TimeoutError") ||
          (e instanceof Error && e.name === "AbortError");
        return NextResponse.json(
          {
            error: isTimeout
              ? "AI-checker не ответил за 110 секунд. Возможно сервис занят или недоступен."
              : `Ошибка соединения с AI-checker: ${
                  e instanceof Error ? e.message : String(e)
                }`,
          },
          { status: 504 }
        );
      }

      if (!resp.ok) {
        const text = await resp.text();
        return NextResponse.json(
          { error: `AI-checker вернул ${resp.status}: ${text.slice(0, 200)}` },
          { status: 502 }
        );
      }

      // Если ngrok-interstitial проскочил мимо нашего header (бывает
      // при первом коннекте), сервер вернёт text/html. Распарсить как
      // JSON мы не сможем — отдадим понятную ошибку вместо stack-trace.
      const contentType = resp.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        const text = await resp.text();
        return NextResponse.json(
          {
            error:
              "AI-checker вернул не-JSON. Если AI-checker работает через ngrok-free — проверь что тоннель открыт без interstitial-страницы. Фрагмент ответа: " +
              text.slice(0, 200),
          },
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
