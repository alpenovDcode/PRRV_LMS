import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { z } from "zod";

const submitSchema = z.object({
  answers: z.array(z.number().int().min(1).max(5)).length(5),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req) => {
    try {
      const { id } = await params;
      const body = await request.json();
      const { answers } = submitSchema.parse(body);

      // 1. Check access
      const lesson = await db.lesson.findUnique({
        where: { id },
        include: {
          module: {
            include: {
              course: {
                include: {
                  enrollments: {
                    where: {
                      userId: req.user!.userId,
                      status: "active",
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!lesson || lesson.module.course.enrollments.length === 0) {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "NO_ACCESS",
              message: "У вас нет доступа к этому уроку",
            },
          },
          { status: 403 }
        );
      }

      // 2. Determine Track
      // Scores map: Track Number -> Score
      const scores: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      
      answers.forEach((ans) => {
        if (scores[ans] !== undefined) {
            scores[ans]++;
        }
      });

      let maxScore = -1;
      let winners: number[] = [];

      for (let i = 1; i <= 5; i++) {
        if (scores[i] > maxScore) {
          maxScore = scores[i];
          winners = [i];
        } else if (scores[i] === maxScore) {
          winners.push(i);
        }
      }

      // 3. Logic handling
      let finalTrack: string | null = null;
      let finalTrackName: string | null = null;
      let message = "";
      let requiresReview = false;

      const TRACK_NAMES: Record<number, string> = {
        1: "Стать репетитором",
        2: "Перейти в онлайн",
        3: "Заполнить расписание",
        4: "Повысить чек",
        5: "Перейти на группы",
      };

      if (winners.length === 1) {
        const winnerId = winners[0];
        finalTrack = winnerId.toString();
        finalTrackName = TRACK_NAMES[winnerId] || `Трек №${winnerId}`;
        
        message = `Мы определили ваш трек: "${finalTrackName}". Он установлен в вашем профиле.`;
        
        // Update User Profile with the NAME of the track, as requested
        await db.user.update({
          where: { id: req.user!.userId },
          data: { track: finalTrackName },
        });

      } else {
        // Tie
        requiresReview = true;
        message = "Система не смогла однозначно определить ваш трек (равенство баллов). Пожалуйста, свяжитесь с куратором для уточнения.";
      }

      // 4. Save Attempt
      await db.quizAttempt.create({
        data: {
          userId: req.user!.userId,
          lessonId: id,
          attemptNumber: 1, // Simplified for this logic
          answers: {
            raw_answers: answers,
            scores: scores,
            winners: winners,
          },
          score: maxScore, // Not strictly used but good for record
          isPassed: true, // It's always passed if submitted
          requiresReview: requiresReview,
          submittedAt: new Date(),
        },
      });

      // 5. Mark Lesson as Completed
      await db.lessonProgress.upsert({
        where: {
            userId_lessonId: {
              userId: req.user!.userId,
              lessonId: id,
            }
        },
        create: {
            userId: req.user!.userId,
            lessonId: id,
            status: "completed",
            watchedTime: 0,
            completedAt: new Date(),
        },
        update: {
            status: "completed",
            completedAt: new Date(),
        }
      });

      return NextResponse.json<ApiResponse>(
        {
          success: true,
          data: {
            track: finalTrack,
            message: message,
            winners: winners, // Debug info if needed
          },
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
              message: "Некорректные данные: " + error.errors.map(e => e.message).join(", "),
            },
          },
          { status: 400 }
        );
      }

      console.error("Track submit error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Ошибка при сохранении результатов",
          },
        },
        { status: 500 }
      );
    }
  });
}
