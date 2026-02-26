export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

/**
 * Отправляет текстовое сообщение в Telegram пользователю (по Chat ID)
 */
export async function sendTelegramMessage(chatId: string, text: string): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn("Telegram Bot Token is not set. Skipping message:", text);
    return false;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Telegram API Error:", errorData);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Failed to send Telegram message:", error);
    return false;
  }
}
