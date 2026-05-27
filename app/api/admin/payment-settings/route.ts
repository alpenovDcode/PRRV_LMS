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
});

/**
 * GET /api/admin/payment-settings
 * Возвращает текущие настройки (создаёт дефолтную запись если её нет).
 */
export async function GET(req: NextRequest) {
  return withAuth(
    req,
    async () => {
      let row = await db.paymentSettings.findUnique({ where: { id: "default" } });
      if (!row) {
        row = await db.paymentSettings.create({ data: { id: "default" } });
      }
      return NextResponse.json({ success: true, data: row });
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
