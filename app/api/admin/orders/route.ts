import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { randomBytes } from "crypto";
import { logAction } from "@/lib/audit";
import { sendEmail, emailTemplates } from "@/lib/email-service";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  status: z.string().max(50).optional(),
  search: z.string().max(100).optional(),
  /**
   * Отдельный поиск по названию оффера — case-insensitive contains.
   * Работает И для LMS-заказов (Order.offer.title / snapshotOfferTitle),
   * И для GetCourse-заказов (GetcourseOrder.composition).
   * Можно комбинировать с search: «Иванов» + «Прорыв» вернёт
   * только заказы Иванова на офферы со словом «Прорыв».
   */
  offer: z.string().max(100).optional(),
});

/**
 * Маппинг русских GC-статусов → наш канон. Используется и для
 * нормализации в ответе, и для подсчёта выручки (нам нужно знать
 * какие именно строки GC-статуса считать «оплаченными»).
 */
const GC_STATUS_MAP: Record<string, string> = {
  "завершён": "paid",
  "завершен": "paid",
  "оплачен": "paid",
  "новый": "pending",
  "ожидает оплаты": "pending",
  "в обработке": "pending",
  "отменён": "cancelled",
  "отменен": "cancelled",
  "возврат": "refunded",
};

/** Все варианты GC-статуса, которые мы считаем «paid» (с учётом регистра). */
const GC_PAID_STATUSES = (() => {
  const lower = Object.entries(GC_STATUS_MAP)
    .filter(([, mapped]) => mapped === "paid")
    .map(([s]) => s);
  // У нас case-insensitive здесь не сработает в Prisma `in`, поэтому
  // генерируем все нужные регистровые варианты вручную.
  const out = new Set<string>();
  for (const s of lower) {
    out.add(s);
    out.add(s.charAt(0).toUpperCase() + s.slice(1));
    out.add(s.toUpperCase());
  }
  return Array.from(out);
})();

/**
 * GET /api/admin/orders?page=1&status=...&search=...&offer=...
 *
 * Возвращает объединённый список LMS + GetCourse заказов.
 * LMS-заказы показываются на первой странице поверх GC-заказов.
 * Каждый элемент содержит поле source: "lms" | "gc".
 *
 * meta.totalRevenue — сумма по ОПЛАЧЕННЫМ (status=paid) заказам с
 * применёнными фильтрами, по обоим источникам (LMS + GC). Считается
 * через _sum: { amount } — не зависит от пагинации, видно реальную
 * выручку, а не только то что попало на текущую страницу.
 */
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
      const { page, status, search, offer } = parsed.data;
      const limit = 50;

      // Фильтр LMS
      const lmsWhere: any = {};
      if (status) lmsWhere.status = status;
      if (search) {
        lmsWhere.OR = [
          { user: { OR: [{ email: { contains: search, mode: "insensitive" } }, { fullName: { contains: search, mode: "insensitive" } }] } },
          { guestEmail: { contains: search, mode: "insensitive" } },
          { guestFullName: { contains: search, mode: "insensitive" } },
        ];
      }
      if (offer) {
        // Поиск по названию оффера. Для LMS это либо текущее offer.title,
        // либо snapshot — старые заказы могут указывать на удалённый/
        // переименованный оффер, а snapshotOfferTitle хранит то, что было
        // в момент покупки.
        lmsWhere.AND = [
          ...(lmsWhere.AND ?? []),
          {
            OR: [
              { offer: { title: { contains: offer, mode: "insensitive" } } },
              { snapshotOfferTitle: { contains: offer, mode: "insensitive" } },
            ],
          },
        ];
      }

      // Фильтр GC
      const gcWhere: any = {};
      if (status) gcWhere.status = { contains: status, mode: "insensitive" };
      if (search) {
        gcWhere.OR = [
          { email: { contains: search, mode: "insensitive" } },
          { customerName: { contains: search, mode: "insensitive" } },
        ];
      }
      if (offer) {
        // У GetCourse «оффер» хранится в поле composition (строка с
        // содержимым заказа). Точного отдельного title нет — composition
        // обычно «Курс Прорыв — Лидер роста · Тариф Standart», поэтому
        // contains-поиск тут самое уместное.
        gcWhere.AND = [
          ...(gcWhere.AND ?? []),
          { composition: { contains: offer, mode: "insensitive" } },
        ];
      }

      // Выручку считаем только по «оплаченным». Если пользователь явно
      // отфильтровал на pending/cancelled/refunded — пропускаем sum
      // (по логике «сколько денег принесли эти заказы» — ноль).
      const shouldCalcRevenue = !status || status === "paid";

      // LMS заказы на странице 1 (их мало, всегда помещаются) + counts
      // обоих источников + выручка (sum по paid в каждом).
      const [lmsOrders, lmsTotal, gcTotal, lmsRevenueAgg, gcRevenueAgg] =
        await Promise.all([
          page === 1
            ? db.order.findMany({
                where: lmsWhere,
                orderBy: { createdAt: "desc" },
                take: limit,
                include: {
                  user: { select: { id: true, email: true, fullName: true } },
                  offer: { select: { id: true, title: true } },
                },
              })
            : Promise.resolve([]),
          db.order.count({ where: lmsWhere }),
          db.getcourseOrder.count({ where: gcWhere }),
          shouldCalcRevenue
            ? db.order.aggregate({
                where: { ...lmsWhere, status: "paid" },
                _sum: { amount: true },
              })
            : Promise.resolve({ _sum: { amount: null } } as const),
          shouldCalcRevenue
            ? db.getcourseOrder.aggregate({
                where: {
                  // Для GC берём те же фильтры (offer/search), но статус
                  // переопределяем нашим перечнем русских вариантов
                  // «paid», игнорируя contains-поиск, который мог быть в
                  // gcWhere.status.
                  ...gcWhere,
                  status: { in: GC_PAID_STATUSES },
                },
                _sum: { amount: true },
              })
            : Promise.resolve({ _sum: { amount: null } } as const),
        ]);

      // Считаем общую выручку. Decimal | null → number, складываем.
      const toNum = (v: unknown): number =>
        v == null ? 0 : typeof v === "number" ? v : Number(v.toString());
      const totalRevenue =
        toNum(lmsRevenueAgg._sum.amount) + toNum(gcRevenueAgg._sum.amount);

      // GC заказы заполняют остаток страницы 1, потом идут самостоятельно
      const gcSlotOnPage1 = limit - lmsOrders.length;
      const gcSkip =
        page === 1
          ? 0
          : gcSlotOnPage1 + (page - 2) * limit;
      const gcTake = page === 1 ? gcSlotOnPage1 : limit;

      const gcOrders = await db.getcourseOrder.findMany({
        where: gcWhere,
        orderBy: { gcCreatedAt: "desc" },
        skip: gcSkip,
        take: gcTake,
        include: { user: { select: { id: true, email: true, fullName: true } } },
      });

      const mapGcStatus = (s: string | null) =>
        s ? (GC_STATUS_MAP[s.toLowerCase()] ?? "pending") : "pending";

      const lmsNormalized = lmsOrders.map((o) => ({ ...o, source: "lms" as const }));
      const gcNormalized = gcOrders.map((o) => ({
        id: o.id,
        source: "gc" as const,
        gcOrderId: o.gcOrderId,
        status: mapGcStatus(o.status),
        amount: o.amount?.toString() ?? "0",
        currency: o.currency ?? "RUB",
        paymentMethod: o.paymentMethod ?? null,
        paidAt: o.gcPaidAt?.toISOString() ?? null,
        createdAt: (o.gcCreatedAt ?? o.importedAt).toISOString(),
        user: o.user ?? null,
        offer: { id: o.id, title: o.composition?.substring(0, 120) ?? "—" },
        customerName: o.customerName,
        email: o.email,
        data: o.data,
      }));

      const total = lmsTotal + gcTotal;

      return NextResponse.json({
        success: true,
        data: [...lmsNormalized, ...gcNormalized],
        meta: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
          // Сумма всех оплаченных заказов под текущие фильтры — не зависит
          // от пагинации. Число (рубли), не строка. Валюту считаем общей —
          // у нас и LMS, и GC в RUB. Если позже добавятся USD-офферы,
          // надо будет разбить по currency.
          totalRevenue,
          totalRevenueCurrency: "RUB",
        },
      });
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}

// ─── POST: создание заказа для пользователя админом ────────────────────────

const createSchema = z.object({
  /**
   * userId обязателен, КРОМЕ режима guest. Гостевые ссылки — заказ
   * без привязки к юзеру: клиент сам заполняет ФИО/email на странице
   * оплаты, и в этот момент userId привязывается.
   */
  userId: z.string().uuid().optional(),
  offerId: z.string().uuid(),
  reason: z.string().max(500).optional(),
  /** Отправить email клиенту со ссылкой. По умолчанию true (для guest = false). */
  sendEmail: z.boolean().default(true),
  /**
   * "user" (дефолт) — обычный заказ под существующего юзера.
   * "guest"         — гостевая ссылка для менеджера, без юзера. Клиент
   *                    заполнит ФИО/email на /pay/[orderId] перед оплатой.
   */
  mode: z.enum(["user", "guest"]).default("user"),
}).refine(
  (data) => data.mode === "guest" || !!data.userId,
  { message: "userId обязателен, если mode не guest", path: ["userId"] }
);

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
      const { userId, offerId, reason, sendEmail: sendEmailFlag, mode } = parsed.data;
      const isGuest = mode === "guest";

      // Юзер ищем только в режиме user. В guest-режиме привязка произойдёт
      // позже через POST /api/pay/[orderId]/identify, когда клиент заполнит
      // ФИО и email на странице оплаты.
      const [user, offer] = await Promise.all([
        isGuest
          ? Promise.resolve(null)
          : db.user.findUnique({
              where: { id: userId! },
              select: { id: true, email: true, fullName: true },
            }),
        db.offer.findUnique({ where: { id: offerId, isActive: true } }),
      ]);
      if (!isGuest && !user) {
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
          // В guest-режиме userId не задаём — он проставится при /identify.
          userId: isGuest ? null : userId!,
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
        isGuest ? "ORDER_CREATED_GUEST_LINK" : "ORDER_CREATED_FOR_USER",
        "Order",
        order.id,
        {
          mode,
          forUserId: userId ?? null,
          forUserEmail: user?.email ?? null,
          offerId,
          offerTitle: offer.title,
          amount: offer.price.toString(),
          reason: reason ?? null,
          emailSent: sendEmailFlag && !isGuest,
        }
      ).catch(() => {});

      // ── Опционально шлём клиенту email со ссылкой ──────────────────────
      // Для guest-ссылки email клиента ещё не известен — менеджер сам
      // отправит её любым каналом.
      let emailSent = false;
      let emailError: string | null = null;
      if (!isGuest && sendEmailFlag && user?.email) {
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
            user: user
              ? { email: user.email, fullName: user.fullName }
              : null,
            mode,
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
