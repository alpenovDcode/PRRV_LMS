import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { logAction } from "@/lib/audit";
import { hashPassword } from "@/lib/auth";
import { z } from "zod";

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  fullName: z.string().optional(),
  role: z.enum(["student", "admin", "curator"]).optional(),
  password: z.string().min(6).optional(),
  phone: z.string().optional(),
  telegram: z.string().optional(),
  about: z.string().optional(),
  avatarUrl: z.string().optional(),
  track: z.string().optional(),
});

/**
 * GET /api/admin/users/[id]
 * Получить детали пользователя
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async () => {
        const { id } = await params;
      try {
        const user = await db.user.findUnique({
          where: { id },
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            avatarUrl: true,
            emailVerified: true,
            createdAt: true,
            updatedAt: true,
            lastActiveAt: true,
            phone: true,
            telegram: true,
            about: true,
            track: true,
            enrollments: {
              select: {
                id: true,
                status: true,
                startDate: true,
                expiresAt: true,
                restrictedModules: true,
                restrictedLessons: true,
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

        // 1. Calculate progress for each enrollment
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

        // 2. Fetch recent activity from multiple sources
        const [auditLogs, homeworks, comments, completedLessons] = await Promise.all([
          // Audit Logs (Logins, updates)
          db.auditLog.findMany({
            where: { userId: id },
            orderBy: { createdAt: "desc" },
            take: 10,
          }),
          // Homework Submissions
          db.homeworkSubmission.findMany({
            where: { userId: id },
            orderBy: { createdAt: "desc" },
            take: 10,
            include: {
              lesson: {
                include: {
                  module: {
                    include: {
                      course: {
                        select: { title: true },
                      },
                    },
                  },
                },
              },
            },
          }),
          // Comments
          db.lessonComment.findMany({
            where: { userId: id },
            orderBy: { createdAt: "desc" },
            take: 10,
            include: {
              lesson: {
                include: {
                  module: {
                    include: {
                      course: {
                        select: { title: true },
                      },
                    },
                  },
                },
              },
            },
          }),
          // Completed Lessons
          db.lessonProgress.findMany({
            where: { 
              userId: id,
              status: "completed"
            },
            orderBy: { lastUpdated: "desc" },
            take: 10,
            include: {
              lesson: {
                select: {
                  title: true,
                  module: {
                    include: {
                      course: {
                        select: { title: true },
                      },
                    },
                  },
                },
              },
            },
          }),
        ]);

        // Normalize and merge activity
        const activity = [
          ...auditLogs.map((log) => {
            let title = `Действие: ${log.action}`;
            let description = JSON.stringify(log.details);
            let type = "system";

            if (log.action === "LOGIN") {
              type = "login";
              title = "Вход в систему";
              description = "Успешная авторизация";
            } else if (log.action === "SUSPICIOUS_LOGIN_FAILED") {
              type = "system"; // Or 'alert' if we had it
              title = "Неудачная попытка входа";
              const details = log.details as any;
              const reasonMap: Record<string, string> = {
                invalid_password: "Неверный пароль",
                user_not_found: "Пользователь не найден",
              };
              description = reasonMap[details?.reason] || details?.reason || "Подозрительная активность";
            } else if (log.action === "UPDATE_USER") {
              type = "system";
              title = "Обновление профиля";
              description = "Изменены данные пользователя";
            }

            return {
              id: log.id,
              type,
              title,
              description,
              date: log.createdAt,
              courseName: null,
            };
          }),
          ...homeworks.map((hw) => ({
            id: hw.id,
            type: "homework",
            title: "Отправлено домашнее задание",
            description: `К уроку "${hw.lesson.title}"`,
            date: hw.createdAt,
            courseName: hw.lesson.module.course.title,
          })),
          ...comments.map((comment) => ({
            id: comment.id,
            type: "comment",
            title: "Оставлен комментарий",
            description: `"${comment.content.substring(0, 50)}${comment.content.length > 50 ? "..." : ""}"`,
            date: comment.createdAt,
            courseName: comment.lesson.module.course.title,
          })),
          ...completedLessons.map((progress) => ({
            id: `${progress.userId}-${progress.lessonId}`, // Composite ID
            type: "lesson_completed",
            title: "Завершен урок",
            description: `"${progress.lesson.title}"`,
            date: progress.lastUpdated,
            courseName: progress.lesson.module.course.title,
          })),
        ]
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, 20);

        return NextResponse.json<ApiResponse>({ 
          success: true, 
          data: {
            ...user,
            enrollments: enrollmentsWithProgress,
            activity,
          } 
        }, { status: 200 });
      } catch (error) {
        console.error("Admin get user error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось получить данные пользователя",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}

/**
 * PATCH /api/admin/users/[id]
 * Обновить пользователя
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async (req) => {
      try {
        const { id } = await params;
        const body = await request.json();
        const { email, fullName, role, password, phone, about, avatarUrl, track, telegram, isBlocked, frozenUntil } = z.object({
          email: z.string().email().optional(),
          fullName: z.string().optional(),
          role: z.enum(["student", "admin", "curator"]).optional(),
          password: z.string().min(6).optional(),
          phone: z.string().optional(),
          telegram: z.string().optional(),
          about: z.string().optional(),
          avatarUrl: z.string().optional(),
          track: z.string().optional(),
          isBlocked: z.boolean().optional(),
          frozenUntil: z.string().nullable().optional(), // Receive as string date or null
        }).parse(body);

        // Проверяем существование пользователя
        const existingUser = await db.user.findUnique({
          where: { id },
          select: { id: true, email: true, role: true, isBlocked: true, frozenUntil: true },
        });

        if (!existingUser) {
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

        // Проверяем уникальность email, если он меняется
        if (email && email !== existingUser.email) {
          const emailExists = await db.user.findUnique({
            where: { email },
            select: { id: true },
          });

          if (emailExists) {
            return NextResponse.json<ApiResponse>(
              {
                success: false,
                error: {
                  code: "EMAIL_EXISTS",
                  message: "Пользователь с таким email уже существует",
                },
              },
              { status: 400 }
            );
          }
        }

        const updateData: any = {};
        if (email !== undefined) updateData.email = email;
        if (fullName !== undefined) updateData.fullName = fullName;
        if (role !== undefined) updateData.role = role;
        if (phone !== undefined) updateData.phone = phone;
        if (telegram !== undefined) updateData.telegram = telegram;
        if (about !== undefined) updateData.about = about;
        if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;
        if (track !== undefined) updateData.track = track;
        if (isBlocked !== undefined) {
            updateData.isBlocked = isBlocked;
            // Reset sessions if blocked
            if (isBlocked) {
                updateData.sessionId = null;
            }
        }
        if (frozenUntil !== undefined) updateData.frozenUntil = frozenUntil ? new Date(frozenUntil) : null;
        
        if (password !== undefined) {
          updateData.passwordHash = await hashPassword(password);
          // При смене пароля инвалидируем все сессии
          updateData.sessionId = null;
        }

        const updatedUser = await db.user.update({
          where: { id },
          data: updateData,
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            updatedAt: true,
            phone: true,
            telegram: true,
            about: true,
            avatarUrl: true,
            track: true,
            isBlocked: true,
            frozenUntil: true,
          },
        });

        // Audit log
        await logAction(req.user!.userId, "UPDATE_USER", "user", id, {
          email: email || existingUser.email,
          role: role || existingUser.role,
          isBlocked: isBlocked !== undefined ? isBlocked : existingUser.isBlocked,
          frozenUntil: frozenUntil !== undefined ? frozenUntil : existingUser.frozenUntil,
          passwordChanged: !!password,
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

        console.error("Admin update user error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось обновить пользователя",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}

/**
 * DELETE /api/admin/users/[id]
 * Удалить пользователя
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async (req) => {
      try {
        const { id } = await params;
        // Нельзя удалить самого себя
        if (id === req.user!.userId) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "CANNOT_DELETE_SELF",
                message: "Нельзя удалить свой собственный аккаунт",
              },
            },
            { status: 400 }
          );
        }

        const user = await db.user.findUnique({
          where: { id },
          select: {
            id: true,
            email: true,
            role: true,
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

        // Audit log перед удалением
        await logAction(req.user!.userId, "DELETE_USER", "user", id, {
          deletedEmail: user.email,
          deletedRole: user.role,
        });

        await db.user.delete({
          where: { id },
        });

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: {
              message: "Пользователь удален",
            },
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("Admin delete user error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось удалить пользователя",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}
