import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { ApiResponse } from "@/types";
import {
  canStartQuizAttempt,
  createQuizAttempt,
  submitQuizAttempt,
} from "@/lib/quiz-logic";
import { logAction } from "@/lib/audit";
import { z } from "zod";

const submitQuizSchema = z.object({
  answers: z.record(z.any()),
});

/**
 * GET /api/lessons/[id]/quiz
 * Получить информацию о возможности начать квиз
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req) => {
    try {
      const { id } = await params;
        const check = await canStartQuizAttempt(req.user!.userId, id);

      return NextResponse.json<ApiResponse>(
        {
          success: true,
          data: check,
        },
        { status: 200 }
      );
    } catch (error) {
      console.error("Get quiz info error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Произошла ошибка при получении информации о квизе",
          },
        },
        { status: 500 }
      );
    }
  });
}

/**
 * POST /api/lessons/[id]/quiz
 * Начать новую попытку квиза
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req) => {
    try {
      const { id } = await params;
        const check = await canStartQuizAttempt(req.user!.userId, id);

      if (!check.canStart) {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: check.reason === "max_attempts_reached" ? "MAX_ATTEMPTS" : "CANNOT_START",
              message:
                check.reason === "max_attempts_reached"
                  ? "Превышено максимальное количество попыток"
                  : check.reason === "active_attempt_exists"
                  ? "У вас есть незавершенная попытка"
                  : "Не удалось начать квиз",
            },
          },
          { status: 400 }
        );
      }

      const attempt = await createQuizAttempt(req.user!.userId, id);

      return NextResponse.json<ApiResponse>(
        {
          success: true,
          data: attempt,
        },
        { status: 201 }
      );
    } catch (error) {
      console.error("Start quiz error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Произошла ошибка при начале квиза",
          },
        },
        { status: 500 }
      );
    }
  });
}

/**
 * PATCH /api/lessons/[id]/quiz
 * Отправить ответы на квиз
 */
export async function PATCH(
  request: NextRequest,
  { params: _params }: { params: Promise<{ id: string }> }
) {
  const params = await _params;
  return withAuth(request, async (_req) => {
    try {
      const body = await request.json();
      const { answers, attemptId } = submitQuizSchema
        .extend({
          attemptId: z.string().min(1),
        })
        .parse(body);

      const result = await submitQuizAttempt(attemptId, answers);

      // Log action
      await logAction((_req as any).user!.userId, "SUBMIT_QUIZ", "quiz_attempt", attemptId, {
        score: result.score,
        isPassed: result.isPassed,
        lessonId: params.id
      });

      return NextResponse.json<ApiResponse>(
        {
          success: true,
          data: result,
        },
        { status: 200 }
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: error.errors[0].message,
            },
          },
          { status: 400 }
        );
      }

      if (error instanceof Error) {
        if (error.message === "Attempt not found") {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "NOT_FOUND",
                message: "Попытка не найдена",
              },
            },
            { status: 404 }
          );
        }
        if (error.message === "Attempt already submitted") {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "ALREADY_SUBMITTED",
                message: "Попытка уже отправлена",
              },
            },
            { status: 400 }
          );
        }
        if (error.message === "Time limit exceeded") {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "TIME_LIMIT_EXCEEDED",
                message: "Время на прохождение квиза истекло",
              },
            },
            { status: 400 }
          );
        }
      }

      console.error("Submit quiz error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Произошла ошибка при отправке квиза",
          },
        },
        { status: 500 }
      );
    }
  });
}

