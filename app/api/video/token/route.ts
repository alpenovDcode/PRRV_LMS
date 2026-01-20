import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;
const CUSTOMER_CODE = process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_CUSTOMER_CODE!;

interface TokenPayload {
  videoId: string;
  userId: string;
  lessonId: string;
  exp: number;
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (req) => {
    try {
      const body = await request.json();
      const { videoId, lessonId } = body;

      if (!videoId || !lessonId) {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "videoId и lessonId обязательны",
            },
          },
          { status: 400 }
        );
      }

      // Проверяем роль пользователя
      const isAdminOrCurator = req.user!.role === UserRole.admin || req.user!.role === UserRole.curator;

      if (isAdminOrCurator) {
        // Для админов и кураторов просто проверяем существование урока
        const lessonExists = await db.lesson.findUnique({
          where: { id: lessonId },
          select: { id: true },
        });

        if (!lessonExists) {
            return NextResponse.json<ApiResponse>(
            {
                success: false,
                error: {
                code: "NOT_FOUND",
                message: "Урок не найден",
                },
            },
            { status: 404 }
            );
        }
      } else {
        // Для студентов проверяем наличие активной подписки
        const lesson = await db.lesson.findUnique({
            where: { id: lessonId },
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
      }

      // Генерируем JWT токен (живет 2 часа)
      const payload: TokenPayload = {
        videoId,
        userId: req.user!.userId,
        lessonId,
        exp: Math.floor(Date.now() / 1000) + 7200, // 2 часа
      };

      const token = jwt.sign(payload, JWT_SECRET);

      return NextResponse.json<ApiResponse>(
        {
          success: true,
          data: {
            token,
            expiresAt: new Date(payload.exp * 1000).toISOString(),
          },
        },
        { status: 200 }
      );
    } catch (error) {
      console.error("Generate video token error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Не удалось сгенерировать токен",
          },
        },
        { status: 500 }
      );
    }
  });
}
