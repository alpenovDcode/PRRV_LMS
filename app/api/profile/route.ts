import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { z } from "zod";

const updateProfileSchema = z.object({
  fullName: z.string().min(2).optional(),
  email: z.string().email().optional(),
  avatarUrl: z.string().optional(),
  phone: z.string().optional(), // We'll accept it but might not store it if DB doesn't have it, or store in a separate table/field if added later.
  telegram: z.string().optional(),
  about: z.string().optional(),
});

export async function GET(request: NextRequest) {
  return withAuth(request, async (req) => {
    try {
      const user = await db.user.findUnique({
        where: { id: req.user!.userId },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          avatarUrl: true,
          phone: true,
          telegram: true,
          telegramChatId: true,
          about: true,
          track: true,
          createdAt: true,
          enrollments: {
            include: {
              course: {
                select: {
                  id: true,
                  title: true,
                },
              },
            },
          },
          _count: {
            select: {
              progress: true,
              homework: true,
              quizAttempts: true,
              lessonComments: true,
              userSessions: true,
            },
          },
        },
      });

      if (!user) {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Пользователь не найден",
            },
          },
          { status: 404 }
        );
      }

      // Calculate progress for each enrollment
      const enrollmentsWithProgress = await Promise.all(
        (user as any).enrollments.map(async (enrollment: any) => {
          const totalLessons = await db.lesson.count({
            where: {
              module: {
                courseId: enrollment.course.id,
              },
            },
          });

          const completedLessons = await db.lessonProgress.count({
            where: {
              userId: user.id,
              status: "completed",
              lesson: {
                module: {
                  courseId: enrollment.course.id,
                },
              },
            },
          });

          const progress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

          return {
            ...enrollment,
            progress,
          };
        })
      );

      return NextResponse.json<ApiResponse>(
        {
          success: true,
          data: {
            ...user,
            enrollments: enrollmentsWithProgress,
          },
        },
        { status: 200 }
      );
    } catch (error) {
      console.error("Get profile error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Не удалось загрузить профиль",
          },
        },
        { status: 500 }
      );
    }
  });
}

export async function PUT(request: NextRequest) {
  return withAuth(request, async (req) => {
    try {
      const body = await request.json();
      const { fullName, email, avatarUrl, phone, about, telegram } = updateProfileSchema.parse(body);

      // Check if email is taken by another user
      if (email) {
        const existingUser = await db.user.findUnique({
          where: { email },
        });

        if (existingUser && existingUser.id !== req.user!.userId) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "EMAIL_EXISTS",
                message: "Email уже используется другим пользователем",
              },
            },
            { status: 400 }
          );
        }
      }

      const updatedUser = await db.user.update({
        where: { id: req.user!.userId },
        data: {
          fullName,
          email,
          avatarUrl,
          phone,
          about,
          telegram,
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          avatarUrl: true,
          phone: true,
          telegram: true,
          telegramChatId: true,
          about: true,
        },
      });

      return NextResponse.json<ApiResponse>(
        {
          success: true,
          data: updatedUser,
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

      console.error("Update profile error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Не удалось обновить профиль",
          },
        },
        { status: 500 }
      );
    }
  });
}
