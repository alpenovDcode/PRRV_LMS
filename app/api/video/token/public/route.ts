import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;

interface TokenPayload {
  videoId: string;
  userId: string;
  lessonId: string;
  exp: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { videoId, landingSlug } = body;

    if (!videoId || !landingSlug) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "videoId и landingSlug обязательны",
          },
        },
        { status: 400 }
      );
    }

    // Проверяем, существует ли лендинг и содержит ли он это видео (выбираем только нужные поля)
    const landing = await db.landingPage.findUnique({
      where: { slug: landingSlug },
      select: { 
        id: true, 
        blocks: {
          select: {
            type: true,
            content: true
          }
        } 
      },
    });

    if (!landing) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Лендинг не найден",
          },
        },
        { status: 404 }
      );
    }

    // Проверяем наличие видео в блоках лендинга
    const hasVideo = landing.blocks.some(b => {
      if (b.type !== 'video' && b.type !== 'hero') return false;
      const content = b.content as any;
      return content?.videoId === videoId;
    });

    if (!hasVideo) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "NO_ACCESS",
            message: "Видео не принадлежит этому лендингу",
          },
        },
        { status: 403 }
      );
    }

    // Генерируем JWT токен (живет 4 часа для публичных страниц)
    const payload: TokenPayload = {
      videoId,
      userId: "public",
      lessonId: "landing",
      exp: Math.floor(Date.now() / 1000) + 14400, // 4 часа
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
    console.error("Generate public video token error:", error);
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
}
