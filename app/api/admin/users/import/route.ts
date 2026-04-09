import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { hashPassword, generateSessionId } from "@/lib/auth";
import { sendEmail } from "@/lib/email-service";
import { randomBytes } from "crypto";
import { z } from "zod";

const importSchema = z.object({
  emails: z.array(z.string().email()).min(1).max(500),
  courseId: z.string().uuid(),
  tariff: z.enum(["VR", "LR", "SR"]).nullable().optional(),
  track: z.string().nullable().optional(),
});

const LOGIN_URL = `${process.env.NEXT_PUBLIC_APP_URL || "https://prrv.tech"}/login`;

function generatePassword(length = 12): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from(randomBytes(length))
    .map((b) => chars[b % chars.length])
    .join("");
}

function buildWelcomeEmail(email: string, password: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Добро пожаловать!</title>
<style>
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f5f7; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
    .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); overflow: hidden; }
    .header { background-color: #4562F3; padding: 30px 20px; text-align: center; color: #ffffff; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 600; line-height: normal; }
    .content { padding: 30px; color: #333333; line-height: 1.6; }
    .content h2 { font-size: 20px; color: #1a1a1a; margin-top: 0; }
    .credentials { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 20px; margin: 20px 0; }
    .credentials p { margin: 8px 0; font-size: 16px; }
    .credentials strong { color: #1a1a1a; }
    .button-container { text-align: center; margin: 30px 0; }
    .button { display: inline-block; background-color: #4562F3; color: #ffffff !important; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: bold; font-size: 16px; }
    .footer { background-color: #f8fafc; padding: 20px; text-align: center; color: #64748b; font-size: 14px; border-top: 1px solid #e2e8f0; }
</style>
</head>
<body>
<div class="container">
    <div class="header"><h1>Доступ к платформе</h1></div>
    <div class="content">
        <h2>Здравствуйте!</h2>
        <p>Администратор создал для вас аккаунт на образовательной платформе. Теперь у вас есть доступ к личному кабинету и учебным материалам.</p>
        <p>Ваши данные для входа в систему:</p>
        <div class="credentials">
            <p><strong>Email (Логин):</strong> ${email}</p>
            <p><strong>Пароль:</strong> ${password}</p>
        </div>
        <div class="button-container">
            <a href="${LOGIN_URL}" class="button">Войти на платформу</a>
        </div>
        <p>В целях безопасности мы рекомендуем сменить пароль сразу после первого входа в настройках вашего профиля.</p>
        <p>Если у вас возникнут вопросы или проблемы со входом, пожалуйста, свяжитесь с куратором.</p>
    </div>
    <div class="footer"><p>С уважением,<br>Команда LMS Прорыв</p></div>
</div>
</body>
</html>`;
}

export async function POST(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      try {
        const body = await request.json();
        const { emails, courseId, tariff, track } = importSchema.parse(body);

        const course = await db.course.findUnique({
          where: { id: courseId },
          select: { id: true, title: true },
        });

        if (!course) {
          return NextResponse.json<ApiResponse>(
            { success: false, error: { code: "NOT_FOUND", message: "Курс не найден" } },
            { status: 404 }
          );
        }

        const results: {
          email: string;
          status: "created" | "exists" | "error";
          emailSent: boolean;
          error?: string;
        }[] = [];

        for (const rawEmail of emails) {
          const email = rawEmail.trim().toLowerCase();
          if (!email) continue;

          try {
            const existing = await db.user.findUnique({ where: { email } });

            let userId: string;
            let emailSent = false;

            if (existing) {
              userId = existing.id;
              results.push({ email, status: "exists", emailSent: false });
            } else {
              const password = generatePassword();
              const passwordHash = await hashPassword(password);
              const sessionId = generateSessionId();

              const user = await db.user.create({
                data: {
                  email,
                  passwordHash,
                  sessionId,
                  role: UserRole.student,
                  tariff: tariff ?? null,
                  track: track ?? null,
                },
              });

              userId = user.id;

              try {
                await sendEmail({
                  to: email,
                  subject: "Ваш доступ к образовательной платформе Прорыв",
                  html: buildWelcomeEmail(email, password),
                });
                emailSent = true;
              } catch {
                // аккаунт создан, но письмо не отправлено
              }

              results.push({ email, status: "created", emailSent });
            }

            await db.enrollment.upsert({
              where: { userId_courseId: { userId, courseId } },
              update: { status: "active" },
              create: {
                userId,
                courseId,
                status: "active",
                startDate: new Date(),
              },
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : "Unknown error";
            results.push({ email, status: "error", emailSent: false, error: message });
          }
        }

        const created = results.filter((r) => r.status === "created").length;
        const exists = results.filter((r) => r.status === "exists").length;
        const errors = results.filter((r) => r.status === "error").length;

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: {
              summary: { total: results.length, created, exists, errors },
              results,
            },
          },
          { status: 200 }
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return NextResponse.json<ApiResponse>(
            { success: false, error: { code: "VALIDATION_ERROR", message: error.errors[0].message } },
            { status: 400 }
          );
        }

        console.error("Import users error:", error);
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "INTERNAL_ERROR", message: "Ошибка импорта пользователей" } },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}
