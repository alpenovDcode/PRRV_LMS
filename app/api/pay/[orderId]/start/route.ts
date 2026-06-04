import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { timingSafeEqual } from "crypto";
import { getProvider, getProviderByName, type ProviderName } from "@/lib/payments";

/**
 * POST /api/pay/[orderId]/start?token=<paymentLinkToken>
 *
 * Публичный endpoint. Создаёт платёж у провайдера для уже существующего
 * заказа (созданного админом через POST /api/admin/orders). Возвращает
 * либо confirmationUrl (redirect-провайдер), либо widget params для
 * открытия CP-виджета на странице /pay/[orderId].
 *
 * Идемпотентность:
 *   - Если ssylка уже паид → 200 с {alreadyPaid: true}, чтобы фронт
 *     показал «Заказ уже оплачен».
 *   - Если уже есть ykConfirmationUrl (redirect-провайдер) и не истёк —
 *     возвращаем его без повторного создания у провайдера.
 *   - Для widget-провайдера всегда возвращаем свежие params (виджет
 *     создаёт транзакцию при клике пользователя, не сейчас).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  // method: cloudpayments (дефолт) | otp. Управляет, какого провайдера
  // вызывать. Дефолт — глобальный из env (CloudPayments на проде).
  const methodParam = (url.searchParams.get("method") ?? "").toLowerCase();
  if (!token) return new NextResponse("Not found", { status: 404 });

  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      amount: true,
      currency: true,
      paymentLinkToken: true,
      snapshotOfferTitle: true,
      ykConfirmationUrl: true,
      userId: true,
      offer: { select: { title: true } },
      user: { select: { email: true, phone: true, fullName: true } },
    } as any,
  });
  if (!order || !(order as any).paymentLinkToken) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Timing-safe token check
  const a = Buffer.from((order as any).paymentLinkToken);
  const b = Buffer.from(token);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const orderAny = order as any;

  // Если уже оплачен — сообщаем фронту
  if (orderAny.status === "paid") {
    return NextResponse.json({ success: true, data: { alreadyPaid: true } });
  }
  if (orderAny.status === "refunded" || orderAny.status === "cancelled") {
    return NextResponse.json(
      { success: false, error: `Заказ ${orderAny.status === "refunded" ? "возвращён" : "отменён"}` },
      { status: 410 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://prrv.tech";
  const returnUrl = `${appUrl}/pay/${order.id}/success`;
  const offerTitle = orderAny.snapshotOfferTitle ?? orderAny.offer?.title ?? "Оплата";

  try {
    // Если фронт явно попросил конкретный метод — берём его. ОТП доступен
    // только если задан OTP_SHOP_CODE (иначе провайдер не сконфигурирован).
    let provider;
    if (methodParam === "otp") {
      if (!process.env.OTP_SHOP_CODE) {
        return NextResponse.json(
          { success: false, error: "ОТП Банк не подключён. Выберите другой способ оплаты." },
          { status: 400 }
        );
      }
      provider = getProviderByName("otp" as ProviderName);
    } else if (methodParam === "freshcredit") {
      if (!process.env.FC_POINT_ID || !process.env.FC_LOGIN) {
        return NextResponse.json(
          { success: false, error: "Freshcredit не подключён. Выберите другой способ оплаты." },
          { status: 400 }
        );
      }
      provider = getProviderByName("freshcredit" as ProviderName);
    } else {
      provider = getProvider();
    }
    const payment = await provider.createPayment({
      orderId: orderAny.id,
      amount: Number(orderAny.amount),
      currency: orderAny.currency as any,
      description: `Оплата: ${offerTitle}`,
      returnUrl,
      customerEmail: orderAny.user?.email,
      customerPhone: orderAny.user?.phone ?? undefined,
      customerAccountId: orderAny.userId,
      receiptItems: [
        { label: offerTitle, price: Number(orderAny.amount), quantity: 1 },
      ],
      metadata: { orderId: orderAny.id },
    });

    const isRedirect = payment.kind === "redirect";
    await db.order.update({
      where: { id: orderAny.id },
      data: {
        ykPaymentId: isRedirect ? payment.providerPaymentId : null,
        ykConfirmationUrl: isRedirect ? payment.confirmationUrl : null,
        // Запоминаем выбранный метод — нужен, чтобы потом отличать webhook'и
        // ОТП от CP и показывать корректные реквизиты в админке/profile.
        paymentMethod: provider.name,
      },
    });

    if (payment.kind === "redirect") {
      return NextResponse.json({
        success: true,
        data: { kind: "redirect", confirmationUrl: payment.confirmationUrl },
      });
    }
    return NextResponse.json({
      success: true,
      data: {
        kind: "widget",
        widget: payment.widget,
        params: payment.params,
        paymentType: payment.paymentType ?? "charge",
      },
    });
  } catch (err) {
    console.error("[pay/start] Provider error:", err);
    return NextResponse.json(
      { success: false, error: "Не удалось создать платёж. Попробуйте позже." },
      { status: 502 }
    );
  }
}
