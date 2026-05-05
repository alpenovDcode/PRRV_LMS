/**
 * Telegram Bot integration — send-only notifications.
 *
 * Setup:
 * 1. Create a bot via @BotFather, get the token.
 * 2. Add the bot to the target group/channel as admin (or start a private chat).
 * 3. Get chat_id:
 *    - For a group, send any message in the group, then call:
 *      https://api.telegram.org/bot<TOKEN>/getUpdates
 *      and look for `chat.id` (negative for groups).
 *    - For a channel, use @username_to_id_bot or the API.
 * 4. Set env vars:
 *      TELEGRAM_BOT_TOKEN=123456:ABC...
 *      TELEGRAM_QUESTIONS_CHAT_ID=-1001234567890   (target group/channel)
 *      NEXT_PUBLIC_APP_URL=https://prrv.tech       (for clickable links)
 */

const TELEGRAM_API = "https://api.telegram.org";

export interface TelegramSendOptions {
  chatId?: string | number; // overrides default
  parseMode?: "HTML" | "MarkdownV2";
  disablePreview?: boolean;
  buttons?: { text: string; url: string }[];
}

export async function sendTelegramMessage(text: string, options: TelegramSendOptions = {}): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = options.chatId ?? process.env.TELEGRAM_QUESTIONS_CHAT_ID;

  if (!token || !chatId) {
    console.warn("[telegram] TELEGRAM_BOT_TOKEN / TELEGRAM_QUESTIONS_CHAT_ID not set — skip");
    return false;
  }

  const body: any = {
    chat_id: chatId,
    text,
    parse_mode: options.parseMode || "HTML",
    disable_web_page_preview: options.disablePreview ?? true,
  };

  if (options.buttons && options.buttons.length > 0) {
    body.reply_markup = {
      inline_keyboard: [options.buttons.map((b) => ({ text: b.text, url: b.url }))],
    };
  }

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("[telegram] sendMessage failed", res.status, errText);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[telegram] sendMessage error", e);
    return false;
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
