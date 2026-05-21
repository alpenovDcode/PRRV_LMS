import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import { tgGetMe, tgGetWebhookInfo } from "@/lib/tg/api";
import { trackEvent } from "@/lib/tg/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Проверяет «здоровье» бота с точки зрения Telegram:
//   • getMe       — токен валиден? username совпадает с сохранённым?
//   • getWebhookInfo — webhook стоит на нашем URL? есть ли pending_update_count?
//                      есть ли last_error_message?
//
// Возвращает структурированный ответ — UI рисует чек-лист с галочками
// и красными крестиками. Никаких side-эффектов в БД.
export async function GET(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async () => {
      const bot = await db.tgBot.findUnique({
        where: { id: params.botId },
        select: {
          id: true,
          username: true,
          botUserId: true,
          tokenEncrypted: true,
          webhookUrl: true,
        },
      });
      if (!bot) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Bot not found" } },
          { status: 404 }
        );
      }

      const [meRes, whRes] = await Promise.all([
        tgGetMe(bot.tokenEncrypted),
        tgGetWebhookInfo(bot.tokenEncrypted),
      ]);

      const tokenOk = meRes.ok === true;
      const tokenMatchesBot =
        tokenOk &&
        meRes.result?.username === bot.username &&
        String(meRes.result?.id) === bot.botUserId;

      const webhookOk = whRes.ok === true && !!whRes.result?.url;
      const webhookMatches =
        webhookOk &&
        whRes.result?.url &&
        bot.webhookUrl &&
        whRes.result.url === bot.webhookUrl;

      const issues: Array<{
        severity: "warn" | "error";
        code: string;
        message: string;
      }> = [];
      if (!tokenOk) {
        issues.push({
          severity: "error",
          code: "TOKEN_INVALID",
          message:
            meRes.description ?? "getMe не сработал — токен невалиден или сеть.",
        });
      } else if (!tokenMatchesBot) {
        issues.push({
          severity: "error",
          code: "TOKEN_MISMATCH",
          message: `getMe вернул @${meRes.result?.username}, но бот сохранён как @${bot.username}. Возможно, токен подменили.`,
        });
      }

      if (!webhookOk) {
        issues.push({
          severity: "error",
          code: "WEBHOOK_NOT_SET",
          message:
            whRes.description ??
            "Webhook не установлен — бот не получит обновлений.",
        });
      } else if (bot.webhookUrl && !webhookMatches) {
        issues.push({
          severity: "warn",
          code: "WEBHOOK_DRIFT",
          message: `Telegram держит webhook на ${whRes.result?.url}, а у нас сохранён ${bot.webhookUrl}. Возможно, кто-то перевыставил.`,
        });
      }

      if (whRes.result?.last_error_message) {
        issues.push({
          severity: "warn",
          code: "WEBHOOK_LAST_ERROR",
          message: `Последняя ошибка webhook: ${whRes.result.last_error_message}`,
        });
      }
      if (
        whRes.result?.pending_update_count &&
        whRes.result.pending_update_count > 50
      ) {
        issues.push({
          severity: "warn",
          code: "WEBHOOK_BACKLOG",
          message: `${whRes.result.pending_update_count} необработанных апдейтов — webhook не успевает.`,
        });
      }

      // Логируем неблагоприятный результат, чтобы было видно в «Логах».
      if (issues.some((i) => i.severity === "error")) {
        trackEvent({
          type: "bot.health_check_failed",
          botId: bot.id,
          properties: {
            issueCodes: issues.map((i) => i.code),
          },
        }).catch(() => {});
      }

      return NextResponse.json({
        success: true,
        data: {
          checkedAt: new Date().toISOString(),
          token: {
            ok: tokenOk,
            matchesBot: tokenMatchesBot,
            tgUsername: meRes.result?.username ?? null,
            tgId: meRes.result?.id ?? null,
            description: meRes.description ?? null,
          },
          webhook: {
            ok: webhookOk,
            url: whRes.result?.url ?? null,
            pendingUpdateCount: whRes.result?.pending_update_count ?? 0,
            lastErrorDate: whRes.result?.last_error_date ?? null,
            lastErrorMessage: whRes.result?.last_error_message ?? null,
            matchesBot: !!webhookMatches,
          },
          issues,
        },
      });
    },
    { roles: ["admin"] }
  );
}
