import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getMarketingEmailProvider } from "@/lib/email/providers/factory";

/**
 * Endpoints для one-click unsubscribe.
 *
 * GET  /api/email/unsubscribe/[token]
 *   Возвращает данные о подписке (email + статус) для рендера страницы.
 *   Не меняет статус — это безопасно для предпросмотра.
 *
 * POST /api/email/unsubscribe/[token]
 *   Подтверждает отписку. Идемпотентно: повторный POST не падает, просто
 *   возвращает текущий статус. По спецификации RFC 8058 (List-Unsubscribe-Post:
 *   List-Unsubscribe=One-Click) email-клиенты делают POST с пустым body —
 *   соответствуем формату.
 *
 * Public endpoint (в whitelist middleware). Безопасность: токен 32 байта
 * randomBytes, угадать невозможно.
 */

interface RouteContext {
  params: Promise<{ token: string }>;
}

async function findUserByToken(token: string) {
  if (!token || token === "preview") return null;
  return db.user.findUnique({
    where: { unsubscribeToken: token },
    select: {
      id: true,
      email: true,
      fullName: true,
      marketingOptOut: true,
      unsubscribedAt: true,
    },
  });
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  const user = await findUserByToken(token);

  if (!user) {
    // Неизвестный/устаревший токен — возвращаем 200, но без подписки.
    // На фронте покажем «ссылка устарела» вместо 404, чтобы не пугать получателя.
    return NextResponse.json({
      success: true,
      data: { found: false },
    });
  }

  return NextResponse.json({
    success: true,
    data: {
      found: true,
      email: user.email,
      fullName: user.fullName,
      alreadyUnsubscribed: user.marketingOptOut,
      unsubscribedAt: user.unsubscribedAt,
    },
  });
}

export async function POST(_request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  const user = await findUserByToken(token);

  if (!user) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_TOKEN", message: "Ссылка устарела" } },
      { status: 404 }
    );
  }

  if (user.marketingOptOut) {
    return NextResponse.json({
      success: true,
      data: { alreadyUnsubscribed: true, email: user.email },
    });
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      marketingOptOut: true,
      unsubscribedAt: new Date(),
    },
  });

  // Запись EmailEvent — попадает в карточку контакта и в метрики кампаний.
  await db.emailEvent.create({
    data: {
      userId: user.id,
      email: user.email,
      type: "unsubscribed",
      metadata: { source: "one_click_link" },
    },
  });

  // Дёргаем провайдера (если поддерживает) — чтобы Unisender тоже исключил.
  // Не валим запрос если провайдер не сконфигурирован или упал.
  const provider = getMarketingEmailProvider();
  if (provider.unsubscribeContact) {
    try {
      await provider.unsubscribeContact(user.email);
    } catch (e) {
      console.warn("[unsubscribe] provider failed:", e);
    }
  }

  return NextResponse.json({
    success: true,
    data: { unsubscribed: true, email: user.email },
  });
}
