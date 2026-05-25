import { NextRequest, NextResponse } from "next/server";
import { isMockProviderActive } from "@/lib/payments";
import { z } from "zod";

const schema = z.object({
  paymentId: z.string().min(1).max(200),
  orderId: z.string().uuid(),
  outcome: z.enum(["paid", "cancelled"]),
});

/**
 * POST /api/payments/mock-complete
 *
 * Внутренний роут для страницы /payments/mock-pay в dev.
 * Серверно дёргает webhook со shared-secret — клиенту секрет не виден.
 *
 * В production возвращает 404 (mock-провайдер не активен).
 */
export async function POST(req: NextRequest) {
  if (!isMockProviderActive()) {
    return new NextResponse(null, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { paymentId, orderId, outcome } = parsed.data;
  const secret = process.env.MOCK_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "MOCK_WEBHOOK_SECRET is not set" },
      { status: 500 }
    );
  }

  // Серверно отправляем вебхук с секретом
  const origin = new URL(req.url).origin;
  await fetch(`${origin}/api/payments/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-mock-secret": secret,
    },
    body: JSON.stringify({
      mock_event: true,
      payment_id: paymentId,
      orderId,
      status: outcome,
    }),
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
