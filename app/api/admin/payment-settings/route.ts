import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { logAction } from "@/lib/audit";
import { invalidateSettingsCache } from "@/lib/payments/cloudpayments/settings";

const ALL_METHODS = [
  "Card",
  "ForeignCard",
  "Sbp",
  "Dolyame",
  "TcsInstallment",
  "TinkoffPay",
  "SberPay",
  "MirPay",
] as const;

const patchSchema = z.object({
  receiptEnabled: z.boolean().optional(),
  /** 0=ОСН, 1=УСН доходы, 2=УСН доходы-расходы, 3=ЕНВД, 4=ЕСН, 5=Патент */
  taxationSystem: z.number().int().min(0).max(5).optional(),
  /** 0=без НДС, 10=10%, 20=20% */
  vat: z.number().int().refine((v) => [0, 10, 20].includes(v), "vat должен быть 0, 10 или 20").optional(),
  /** 1=предоплата 100%, 2=предоплата, 3=аванс, 4=полный расчёт, 5=частичный+кредит, ... */
  method: z.number().int().min(1).max(7).optional(),
  /** 1=товар, 2=подакцизный, 3=работа, 4=услуга, ... */
  object: z.number().int().min(1).max(13).optional(),
  restrictedMethods: z
    .array(z.enum(ALL_METHODS))
    .max(8)
    .optional(),
  paymentSchema: z.enum(["Single", "Dual"]).optional(),
  /** Глобальный тоггл провайдеров. False = на чек-ауте этот способ не показывается. */
  cloudpaymentsEnabled: z.boolean().optional(),
  otpEnabled: z.boolean().optional(),
  freshcreditEnabled: z.boolean().optional(),
});

/**
 * GET /api/admin/payment-settings
 * Возвращает текущие настройки (создаёт дефолтную запись если её нет)
 * + публичную информацию о подключении ОТП Банка (из env, без секретов).
 */
export async function GET(req: NextRequest) {
  return withAuth(
    req,
    async () => {
      let row = await db.paymentSettings.findUnique({ where: { id: "default" } });
      if (!row) {
        row = await db.paymentSettings.create({ data: { id: "default" } });
      }
      // Конфиг ОТП хранится в env (секреты shopCode/login/password не лежат
      // в БД, чтобы случайно не попасть в дампы / audit log). Отдаём только
      // публичные поля: маскированный shopCode, категория, статус REST API,
      // whitelist IP и наш webhook URL для копирования куратору.
      const otpShop = process.env.OTP_SHOP_CODE || "";
      const otpLogin = !!process.env.OTP_LOGIN;
      const otpPassword = !!process.env.OTP_PASSWORD;
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://prrv.tech";

      // enabled = env-секреты заданы И админ не выключил вручную.
      // configured показывает «технически готов», даже если выключен.
      const otp = {
        configured: !!otpShop,
        enabled: !!otpShop && (row as any).otpEnabled !== false,
        shopCodeMasked: otpShop
          ? otpShop.length > 4
            ? `${"•".repeat(Math.max(0, otpShop.length - 4))}${otpShop.slice(-4)}`
            : otpShop
          : null,
        category: process.env.OTP_CATEGORY || "RGB_GOODS_CATEGORY_138",
        creditType: process.env.OTP_CREDIT_TYPE || "2",
        restConfigured: otpLogin && otpPassword,
        webhookIps: (process.env.OTP_WEBHOOK_IPS || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        webhookUrl: `${appUrl}/api/payments/webhook/otp`,
      };

      // Аналогично для Freshcredit — публичные поля из env, без секретов.
      const fcPointId = process.env.FC_POINT_ID || "";
      const fcLogin = !!process.env.FC_LOGIN;
      const fcPassword = !!process.env.FC_PASSWORD;
      const freshcredit = {
        configured: !!fcPointId && fcLogin && fcPassword,
        enabled:
          !!fcPointId && fcLogin && fcPassword && (row as any).freshcreditEnabled !== false,
        pointIdMasked: fcPointId
          ? fcPointId.length > 6
            ? `${"•".repeat(Math.max(0, fcPointId.length - 6))}${fcPointId.slice(-6)}`
            : fcPointId
          : null,
        goodsCode: process.env.FC_GOODS_CODE || "9",
        creditType: process.env.FC_CREDIT_TYPE || "[1,2]",
        restConfigured: fcLogin && fcPassword,
        webhookIps: (process.env.FC_WEBHOOK_IPS || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        webhookUrl: `${appUrl}/api/payments/webhook/freshcredit`,
        apiBase:
          process.env.FC_API_BASE || "https://formapi.freshcredit.ru:5046/widget-api",
      };

      return NextResponse.json({ success: true, data: row, otp, freshcredit });
    },
    { roles: [UserRole.admin] }
  );
}

/**
 * PATCH /api/admin/payment-settings
 * Обновляет настройки. Сбрасывает кэш — следующий createPayment подхватит.
 */
export async function PATCH(req: NextRequest) {
  return withAuth(
    req,
    async (authedReq) => {
      const body = await req.json().catch(() => null);
      const parsed = patchSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: "Некорректные параметры", details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const row = await db.paymentSettings.upsert({
        where: { id: "default" },
        create: { id: "default", ...parsed.data, updatedById: authedReq.user!.userId },
        update: { ...parsed.data, updatedById: authedReq.user!.userId },
      });

      invalidateSettingsCache();

      await logAction(
        authedReq.user!.userId,
        "PAYMENT_SETTINGS_UPDATED",
        "PaymentSettings",
        "default",
        parsed.data as any
      ).catch(() => {});

      return NextResponse.json({ success: true, data: row });
    },
    { roles: [UserRole.admin] }
  );
}
