import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { randomBytes } from "crypto";
import { logAction } from "@/lib/audit";
import { sendEmail, emailTemplates } from "@/lib/email-service";

// Zod-схема для query params. Маппинг строки→число, ограничения на длину.
const querySchema = z.object({
  page: z
    .coerce.number()
    .int()
    .min(1)
    .max(10_000)
    .default(1),
  status: z
    .enum(["pending", "waiting_for_capture", "paid", "cancelled", "refunded"])
    .optional(),
  search: z.string().max(100).optional(),
});

/** GET /api/admin/orders?page=1&status=paid&search=email */
export async function GET(req: NextRequest) {
  return withAuth(
    req,
    async () => {
      const { searchParams } = new URL(req.url);
      const parsed = querySchema.safeParse({
        page: searchParams.get("page") ?? undefined,
        status: searchParams.get("status") ?? undefined,
        search: searchParams.get("search") ?? undefined,
      });
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: "Некорректные параметры запроса" },
          { status: 400 }
        );
      }
      const { page, status, search } = parsed.data;
      const limit = 50;

      const where: any = {};
      if (status) where.status = status;
      if (search) {
        where.user = {
          OR: [
            { email: { contains: search, mode: "insensitive" } },
            { fullName: { contains: search, mode: "insensitive" } },
          ],
        };
      }

      const [orders, total] = await Promise.all([
        db.order.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
          include: {
            user: { select: { id: true, email: true, fullName: true } },
            offer: { select: { id: true, title: true } },
          },
        }),
        db.order.count({ where }),
      ]);

      return NextResponse.json({
        success: true,
        data: orders,
        meta: { total, page, limit, pages: Math.ceil(total / limit) },
      });
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}

// ─── POST: создание заказа для пользователя админом ────────────────────────

const createSchema = z.object({
  userId: z.string().uuid(),
  offerId: z.string().uuid(),
  reason: z.string().max(500).optional(),
  /** Отправить email клиенту со ссылкой. По умолчанию true. */
  sendEmail: z.boolean().default(true),
});

/**
 * POST /api/admin/orders
 *
 * Админ создаёт заказ для конкретного пользователя и получает ссылку для
 * оплаты. Ссылку отправляет клиенту любым каналом — клиент открывает её
 * и платит без логина в LMS.
 *
 * Возвращает paymentUrl формата:
 *   https://prrv.tech/pay/{orderId}?token={paymentLinkToken}
 */
export async function POST(req: NextRequest) {
  return withAuth(
    req,
    async (authedReq) => {
      const body = await req.json().catch(() => null);
      const parsed = createSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: "Некорректные параметры" },
          { status: 400 }
        );
      }
      const { userId, offerId, reason, sendEmail: sendEmailFlag } = parsed.data;

      // Проверяем что юзер и оффер существуют
      const [user, offer] = await Promise.all([
        db.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true, fullName: true },
        }),
        db.offer.findUnique({ where: { id: offerId, isActive: true } }),
      ]);
      if (!user) {
        return NextResponse.json(
          { success: false, error: "Пользователь не найден" },
          { status: 404 }
        );
      }
      if (!offer) {
        return NextResponse.json(
          { success: false, error: "Оффер не найден или отключён" },
          { status: 404 }
        );
      }

      const paymentLinkToken = randomBytes(32).toString("hex");

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
          paymentLinkToken,
          createdByAdminId: authedReq.user!.userId,
        } as any,
      });

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://prrv.tech";
      const paymentUrl = `${appUrl}/pay/${order.id}?token=${paymentLinkToken}`;

      await logAction(
        authedReq.user!.userId,
        "ORDER_CREATED_FOR_USER",
        "Order",
        order.id,
        {
          forUserId: userId,
          forUserEmail: user.email,
          offerId,
          offerTitle: offer.title,
          amount: offer.price.toString(),
          reason: reason ?? null,
          emailSent: sendEmailFlag,
        }
      ).catch(() => {});

      // ── Опционально шлём клиенту email со ссылкой ──────────────────────
      let emailSent = false;
      let emailError: string | null = null;
      if (sendEmailFlag && user.email) {
        try {
          const formattedAmount = new Intl.NumberFormat("ru-RU", {
            style: "currency",
            currency: offer.currency,
            maximumFractionDigits: 0,
          }).format(Number(offer.price));

          await sendEmail({
            to: user.email,
            subject: `Счёт на оплату: ${offer.title}`,
            html: emailTemplates.paymentLink({
              offerTitle: offer.title,
              amount: formattedAmount,
              paymentUrl,
              customerName: user.fullName,
            }),
          });
          emailSent = true;
        } catch (err) {
          emailError = err instanceof Error ? err.message : String(err);
          console.error("[create-order] email send failed:", emailError);
        }
      }

      return NextResponse.json(
        {
          success: true,
          data: {
            orderId: order.id,
            paymentUrl,
            user: { email: user.email, fullName: user.fullName },
            offer: { title: offer.title, price: offer.price.toString() },
            emailSent,
            emailError,
          },
        },
        { status: 201 }
      );
    },
    { roles: [UserRole.admin] }
  );
}
