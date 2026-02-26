import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { randomBytes } from "crypto";

export async function GET(request: NextRequest) {
  return withAuth(request, async (req) => {
    try {
      const user = await db.user.findUnique({
        where: { id: req.user!.userId },
        select: { telegramChatId: true, telegramAuthToken: true },
      });

      if (!user) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "NOT_FOUND", message: "Пользователь не найден" } },
          { status: 404 }
        );
      }

      // If already connected, no need to generate link
      if (user.telegramChatId) {
        return NextResponse.json<ApiResponse>(
          { success: true, data: { alreadyConnected: true } },
          { status: 200 }
        );
      }

      // Generate a new 16-character connection token
      const token = randomBytes(8).toString("hex");

      await db.user.update({
        where: { id: req.user!.userId },
        data: { telegramAuthToken: token },
      });

      const botUsername = process.env.TELEGRAM_BOT_USERNAME || "Бот";
      
      return NextResponse.json<ApiResponse>(
        {
          success: true,
          data: {
            link: `https://t.me/${botUsername}?start=${token}`,
            token,
          },
        },
        { status: 200 }
      );
    } catch (error) {
      console.error("Failed to generate Telegram link:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: { code: "INTERNAL_ERROR", message: "Ошибка генерации ссылки" },
        },
        { status: 500 }
      );
    }
  });
}

// Disconnect Telegram
export async function DELETE(request: NextRequest) {
  return withAuth(request, async (req) => {
    try {
      await db.user.update({
        where: { id: req.user!.userId },
        data: { telegramChatId: null, telegramAuthToken: null },
      });

      return NextResponse.json<ApiResponse>({ success: true, data: {} }, { status: 200 });
    } catch (error) {
      console.error("Failed to disconnect Telegram:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: { code: "INTERNAL_ERROR", message: "Ошибка отключения Telegram" },
        },
        { status: 500 }
      );
    }
  });
}
