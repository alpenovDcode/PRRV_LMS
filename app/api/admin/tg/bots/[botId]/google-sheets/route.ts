/**
 * app/api/admin/tg/bots/[botId]/google-sheets/route.ts
 *
 * Конфиг авто-экспорта подписчиков в Google Sheets.
 *
 *   GET  — текущий конфиг (создаёт пустой выключенный, если нет).
 *   PUT  — сохранить конфиг (enabled, webhookUrl, secret, columns,
 *          reexportTags).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const columnSchema = z.object({
  field: z.string().min(1).max(80),
  header: z.string().min(1).max(120),
});

const putSchema = z.object({
  enabled: z.boolean(),
  webhookUrl: z
    .string()
    .url("Нужен валидный URL")
    .max(1000)
    .nullable()
    .optional(),
  secret: z.string().max(200).nullable().optional(),
  columns: z.array(columnSchema).max(40).default([]),
  reexportTags: z.array(z.string().min(1).max(64)).max(50).default([]),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ botId: string }> }
) {
  const { botId } = await params;
  return withAuth(
    req,
    async () => {
      let cfg = await db.tgGoogleSheetsConfig.findUnique({ where: { botId } });
      if (!cfg) {
        cfg = await db.tgGoogleSheetsConfig.create({ data: { botId } });
      }
      return NextResponse.json({ success: true, data: cfg });
    },
    { roles: ["admin"] }
  );
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ botId: string }> }
) {
  const { botId } = await params;
  return withAuth(
    req,
    async () => {
      const body = await req.json().catch(() => null);
      const parsed = putSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: parsed.error.issues[0]?.message ?? "Некорректные данные" },
          { status: 400 }
        );
      }
      const data = parsed.data;
      const cfg = await db.tgGoogleSheetsConfig.upsert({
        where: { botId },
        create: {
          botId,
          enabled: data.enabled,
          webhookUrl: data.webhookUrl ?? null,
          secret: data.secret ?? null,
          columns: data.columns,
          reexportTags: data.reexportTags,
        },
        update: {
          enabled: data.enabled,
          webhookUrl: data.webhookUrl ?? null,
          secret: data.secret ?? null,
          columns: data.columns,
          reexportTags: data.reexportTags,
        },
      });
      return NextResponse.json({ success: true, data: cfg });
    },
    { roles: ["admin"] }
  );
}
