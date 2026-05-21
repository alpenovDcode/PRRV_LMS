import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";

const AI_CHECKER_URL = process.env.AI_CHECKER_URL || "http://localhost:3000";
const AI_CHECKER_KEY = process.env.AI_CHECKER_KEY || "";
// Секрет, которым AI-checker подписывает callback. Если не выставлен —
// используем тот же ключ что и для X-API-Key, чтобы не плодить
// конфигурацию. В .env-prod лучше задать отдельным AI_CALLBACK_SECRET.
const AI_CALLBACK_SECRET = process.env.AI_CALLBACK_SECRET || AI_CHECKER_KEY;
const PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://prrv.tech";

/**
 * POST /api/curator/homework/[id]/ai-analyze
 *
 * Hybrid async pattern (см. docs/AI_CHECKER_CONTRACT.md):
 *  1. Помечаем submission как "анализируется" (aiAnalysisStartedAt = now,
 *     aiAnalysisError = null, очищаем прошлые aiSuggested*).
 *  2. Передаём AI-checker callbackUrl + callbackSecret вместе с
 *     payload-ом. AI-checker ДОЛЖЕН вернуть 202 быстро (< 15 с) и
 *     позже POST-нуть результат на callbackUrl.
 *  3. Возвращаем фронту 202 — он начинает polling по
 *     GET /api/curator/homework/[id] и ждёт появления aiAnalyzedAt
 *     либо aiAnalysisError.
 *
 * Legacy sync-режим (AI-checker сразу возвращает {verdict, comment})
 * по-прежнему поддерживается — пишем результат в БД немедленно и
 * отдаём 200 с данными. Это нужно для обратной совместимости пока
 * AI-checker не обновили.
 */
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

      // 1. Помечаем submission как "анализируется". Параллельно сбрасываем
      //    результаты прошлой попытки — фронт по этим полям понимает, что
      //    надо переключиться в polling-режим и не показывать старый
      //    вердикт.
      await db.homeworkSubmission.update({
        where: { id },
        data: {
          aiAnalysisStartedAt: new Date(),
          aiAnalysisError: null,
          aiSuggestedVerdict: null,
          aiSuggestedComment: null,
          aiAnalyzedAt: null,
        } as any,
      });

      // 2. Готовим callback. AI-checker позже POST-нёт сюда результат.
      const callbackUrl = `${PUBLIC_APP_URL}/api/internal/ai-callback/${id}`;

      // 3. Передаём AI-checker задачу. Таймаут короткий (15 с) — мы
      //    ждём только ACK, а не сам анализ. Если AI-checker всё-таки
      //    в legacy sync-режиме и пытается посчитать прямо здесь — мы
      //    оборвём соединение по таймауту и оставим submission в
      //    состоянии "в процессе", чтобы AI-checker мог дописать
      //    результат позже через callback (если он его поддерживает).
      let resp: Response;
      try {
        resp = await fetch(`${AI_CHECKER_URL}/api/homework/analyze`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": AI_CHECKER_KEY,
            // ngrok-free interstitial-protect (см. предыдущую версию).
            "ngrok-skip-browser-warning": "true",
          },
          body: JSON.stringify({
            // --- Новые поля для async-режима ---
            submissionId: id,
            callbackUrl,
            callbackSecret: AI_CALLBACK_SECRET,
            // --- Payload (как раньше) ---
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
          // 15 секунд — ждём только ACK. AI-checker должен отвечать
          // сразу: либо 202 (async), либо 200 (legacy sync, что для
          // быстрых заданий тоже сработает).
          signal: AbortSignal.timeout(15_000),
        });
      } catch (e) {
        const isTimeout =
          (e instanceof Error && e.name === "TimeoutError") ||
          (e instanceof Error && e.name === "AbortError");
        const errMsg = isTimeout
          ? "AI-checker не подтвердил приём задачи за 15 секунд. Возможно сервис недоступен или работает в старом sync-режиме."
          : `Ошибка соединения с AI-checker: ${
              e instanceof Error ? e.message : String(e)
            }`;
        // Записываем ошибку в submission, чтобы фронт смог её показать
        // и предложить перезапуск.
        await db.homeworkSubmission.update({
          where: { id },
          data: { aiAnalysisError: errMsg } as any,
        });
        return NextResponse.json({ error: errMsg }, { status: 504 });
      }

      // 4. Async-режим: AI-checker вернул 202 → задачу принял, ждём
      //    callback. Фронту отдаём 202 — он запускает polling.
      if (resp.status === 202) {
        return NextResponse.json(
          {
            ok: true,
            status: "queued",
            message:
              "Анализ запущен. Результат появится через 1-5 минут — страница обновится автоматически.",
          },
          { status: 202 }
        );
      }

      // 5. Не-2xx → ошибка от AI-checker.
      if (!resp.ok) {
        const text = await resp.text();
        const errMsg = `AI-checker вернул ${resp.status}: ${text.slice(0, 200)}`;
        await db.homeworkSubmission.update({
          where: { id },
          data: { aiAnalysisError: errMsg } as any,
        });
        return NextResponse.json({ error: errMsg }, { status: 502 });
      }

      // 6. 2xx, не 202 → legacy sync-режим. AI-checker уже посчитал и
      //    вернул JSON с verdict/comment. Сохраняем результат и
      //    возвращаем фронту 200 — polling не нужен.
      const contentType = resp.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        const text = await resp.text();
        const errMsg =
          "AI-checker вернул не-JSON. Если AI-checker работает через ngrok-free — проверь что тоннель открыт без interstitial-страницы. Фрагмент ответа: " +
          text.slice(0, 200);
        await db.homeworkSubmission.update({
          where: { id },
          data: { aiAnalysisError: errMsg } as any,
        });
        return NextResponse.json({ error: errMsg }, { status: 502 });
      }

      const result = await resp.json();

      // Если в legacy-режиме AI-checker отдаёт {verdict, comment} —
      // сохраняем результат сейчас. Если же тело пустое или без
      // verdict — значит AI-checker уже async, но забыл вернуть 202
      // (или мы прочитали ACK с пустым телом). В таком случае оставляем
      // submission в polling-состоянии и отдаём 202.
      if (result?.verdict && result?.comment) {
        await db.homeworkSubmission.update({
          where: { id },
          data: {
            aiSuggestedVerdict: result.verdict,
            aiSuggestedComment: result.comment,
            aiAnalyzedAt: new Date(),
            aiAnalysisError: null,
          } as any,
        });
        return NextResponse.json({
          ok: true,
          status: "done",
          verdict: result.verdict,
          comment: result.comment,
        });
      }

      // AI-checker ответил 2xx без verdict — считаем async ACK.
      return NextResponse.json(
        {
          ok: true,
          status: "queued",
          message:
            "Анализ запущен. Результат появится через 1-5 минут — страница обновится автоматически.",
        },
        { status: 202 }
      );
    },
    { roles: [UserRole.curator, UserRole.admin] }
  );
}
