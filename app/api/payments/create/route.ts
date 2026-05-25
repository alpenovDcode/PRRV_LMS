import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { getProvider } from "@/lib/payments";
import { z } from "zod";

const schema = z.object({
  offerId: z.string().uuid(),
});

/** Окно идемпотентности: если есть свежий pending заказ — переиспользуем его. */
const PENDING_REUSE_WINDOW_MS = 60 * 60 * 1000; // 1 час

/**
 * POST /api/payments/create
 *
 * Создаёт (или переиспользует свежий pending) заказ + платёж у провайдера.
 * Возвращает confirmationUrl для редиректа пользователя.
 */
export async function POST(req: NextRequest) {
  return withAuth(req, async (authedReq) => {
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Некорректный запрос" },
        { status: 400 }
      );
    }
    const { offerId } = parsed.data;
    const userId = authedReq.user!.userId;

    const offer = await db.offer.findUnique({
      where: { id: offerId, isActive: true },
    });
    if (!offer) {
      return NextResponse.json(
        { success: false, error: "Оффер не найден" },
        { status: 404 }
      );
    }

    // ── Idempotency: ищем свежий pending заказ того же пользователя на тот же оффер
    const recent = await db.order.findFirst({
      where: {
        userId,
        offerId,
        status: "pending",
        createdAt: { gte: new Date(Date.now() - PENDING_REUSE_WINDOW_MS) },
      },
      orderBy: { createdAt: "desc" },
    });

    // Если нашли pending с валидным confirmationUrl и совпадающей суммой —
    // отдаём его без обращения к провайдеру.
    if (recent && recent.ykConfirmationUrl && recent.amount.equals(offer.price)) {
      return NextResponse.json({
        success: true,
        data: {
          orderId: recent.id,
          confirmationUrl: recent.ykConfirmationUrl,
        },
      });
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { email: true, phone: true, fullName: true },
    });

    // Создаём новый заказ со снапшотом оффера.
    // Снапшот фиксирует то, ЗА ЧТО заплатил пользователь — изменения оффера
    // после создания заказа не повлияют на состав активируемого доступа.
    const order = await db.order.create({
      data: {
        userId,
        offerId,
        amount: offer.price,
        currency: offer.currency,
        status: "pending",
        snapshotCourseIds: offer.courseIds,
        snapshotTariff: offer.tariff,
        snapshotAccessDays: offer.accessDays,
        snapshotOfferTitle: offer.title,
      },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://prrv.tech";
    const returnUrl = `${appUrl}/payments/success?orderId=${order.id}`;

    try {
      const provider = getProvider();
      const payment = await provider.createPayment({
        orderId: order.id,
        amount: Number(offer.price),
        currency: offer.currency as any,
        description: `Оплата: ${offer.title}`,
        returnUrl,
        customerEmail: user?.email,
        customerPhone: user?.phone ?? undefined,
        metadata: { orderId: order.id, userId, offerId },
      });

      await db.order.update({
        where: { id: order.id },
        data: {
          ykPaymentId: payment.providerPaymentId,
          ykConfirmationUrl: payment.confirmationUrl,
        },
      });

      return NextResponse.json({
        success: true,
        data: {
          orderId: order.id,
          confirmationUrl: payment.confirmationUrl,
        },
      });
    } catch (err) {
      // Помечаем заказ как cancelled, чтобы он не висел в pending навсегда.
      await db.order
        .update({ where: { id: order.id }, data: { status: "cancelled" } })
        .catch(() => {});
      console.error("[payments/create] Provider error:", err);
      return NextResponse.json(
        { success: false, error: "Не удалось создать платёж" },
        { status: 502 }
      );
    }
  });
}
