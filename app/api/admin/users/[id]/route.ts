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
            phone: true,
            telegram: true,
            about: true,
            track: true,
            enrollments: {
              include: {
                course: {
                  select: {
                    id: true,
                    title: true,
                  },
                },
              },
            }, // NOTE: Needs explicit select if using select: {}, but here it uses include inside select? 
               // Wait, line 37 starts `select: {`. Line 50 is `enrollments: { include: ... }`.
               // Prisma allows `select` -> `enrollments` -> `select` OR `include` if referring to relation.
               // Actually, if `enrollments` is a relation, `select: { enrollments: { select: { ... } } }` is standard.
               // But here it uses `select: { enrollments: { include: ... } }`.
               // If I want to include scalar fields of the relation, I implicitly get all if I don't use `select` inside?
               // NO. `select` on the top level means ONLY selected fields are returned.
               // `enrollments: { include: ... }` inside a `select` is INVALID in recent Prisma?
               // Usually `select` -> `enrollments: { select: { ... } }`.
               // If the current code works, it implies `enrollments` returns the object relation.
               // But since `select` is used on `user`, `enrollments` must be selected.
               // If I use `include` inside `select` for a relation, it might return all fields + included relations?
               // Actually, `select` and `include` are mutually exclusive AT THE SAME LEVEL.
               // But nested?
               // `db.user.findUnique({ select: { enrollments: { include: { course: ... } } } })`
               // This implies "Select everything from enrollments AND include course".
               // So `restrictedModules` SHOULD be returned if it's a scalar on `Enrollment`.
               // UNLESS `include` overrides scalar selection in some Prisma versions?
               // Usually `include` adds to the default selection set (all scalars).
               // So if `restrictedModules` is a scalar on `Enrollment`, it should be there.

               // Wait. I manually ADDED these columns in a migration just now.
               // `app/api/admin/users/[id]/route.ts` was deployed BEFORE the migration files were "seen" by the code generator?
               // `npx prisma generate` was run locally.
               // `make restart` runs `npm run build`. `npm run build` runs `prisma generate`.
               // So the backend SHOULD have known about them. 
               
               // But look at line 50:
               /*
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
               */
               // If this is inside `select: { ... }` of `user`, then `enrollments` property is being projected.
               // If `enrollments` uses `include`, it typically includes all scalars of `enrollment`.
               // So `restrictedModules` *should* be there.

               // UNLESS the local `node_modules/.prisma/client` used by VSCode (or me) or the server build is stale?
               // The server build was restarted.

               // Let's explicitly `select` the fields to be 100% sure.
               // Replacing `include` with `select`.
               /*
                enrollments: {
                  select: {
                     id: true,
                     status: true,
                     startDate: true,
                     expiresAt: true,
                     progress: true, // Wait, progress is calculated manually later? No, there is `progress` field on Enrollment model?
                     // Line 78 in `page.tsx` interface says `progress: number`.
                     // Line 112 overrides it: `progress` calculated.
                     // But strictly speaking, we need the fields.
                     restrictedModules: true, // <--- ADD THIS
                     restrictedLessons: true, // <--- ADD THIS
                     course: {
                        select: { id: true, title: true }
                     }
                  }
                }
               */
               // I see `progress` column in `Enrollment`?
               // `page.tsx`:
               /*
                 items:
                 id, courseId, status, startDate, expiresAt, progress (from DB?), course...
               */
               // The route calculates progress in Step 1 (lines 85-115) and overrides it.
               
               // I will proceed to change `include` to `select` to be explicit and safe.

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
