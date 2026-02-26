import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendTelegramMessage } from "@/lib/telegram";

/**
 * Вебхук от Telegram
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Telegram Updates structure: body.message
    if (body.message && body.message.text && body.message.text.startsWith("/start ")) {
      const chatId = String(body.message.chat.id);
      const token = body.message.text.replace("/start ", "").trim();

      if (token) {
        // Find user by this AuthToken
        const user = await db.user.findUnique({
          where: { telegramAuthToken: token },
        });

        if (user) {
          // Connect account
          await db.user.update({
            where: { id: user.id },
            data: {
              telegramChatId: chatId,
              telegramAuthToken: null, // one-time use
            },
          });

          await sendTelegramMessage(
            chatId,
            `✅ <b>Успешно!</b>\n\nВаш аккаунт привязан к платформе ПРЫЖОК. Теперь вы будете получать сюда уведомления об оценке ваших домашних заданий.`
          );
        } else {
          // Token invalid or expired
          await sendTelegramMessage(
            chatId,
            `❌ Ошибка привязки.\n\nСсылка устарела или недействительна. Сгенерируйте новую ссылку в профиле на платформе.`
          );
        }
      }
    }

    // Always return 200 OK so Telegram doesn't retry
    return new NextResponse("OK", { status: 200 });
  } catch (error) {
    console.error("Telegram Webhook Error:", error);
    // Still return 200 so Telegram stops retrying problematic messages
    return new NextResponse("Error handled", { status: 200 });
  }
}
