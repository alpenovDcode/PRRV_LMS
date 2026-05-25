/**
 * GET  /api/admin/tg/bots/[botId]/bitrix  — get current config
 * PUT  /api/admin/tg/bots/[botId]/bitrix  — save config
 * POST /api/admin/tg/bots/[botId]/bitrix  — test connection + return funnels & fields
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import {
  fetchBitrixFunnels,
  fetchBitrixDealFields,
} from "@/lib/tg/bitrix-sync";

// ─── Zod schema for config save ─────────────────────────────────────────────

const fieldMappingSchema = z.object({
  lmsVar: z.string().min(1),
  bitrixField: z.string().min(1),
});

const tagTriggerSchema = z.object({
  tag: z.string().min(1),
  stageId: z.string(),
});

const configSchema = z.object({
  enabled: z.boolean(),
  webhookUrl: z.string().nullable().optional(),
  funnelId: z.string().default("0"),
  defaultStageId: z.string().default(""),
  contactMappings: z.array(fieldMappingSchema).default([]),
  dealMappings: z.array(fieldMappingSchema).default([]),
  tagTriggers: z.array(tagTriggerSchema).default([]),
});

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ botId: string }> }
) {
  return withAuth(
    req,
    async () => {
      const { botId } = await params;

      const config = await db.tgBitrixConfig.findUnique({ where: { botId } });

      // Return empty defaults if not yet configured
      return NextResponse.json({
        enabled: config?.enabled ?? false,
        webhookUrl: config?.webhookUrl ?? null,
        funnelId: config?.funnelId ?? "0",
        defaultStageId: config?.defaultStageId ?? "",
        contactMappings: config?.contactMappings ?? [],
        dealMappings: config?.dealMappings ?? [],
        tagTriggers: config?.tagTriggers ?? [],
      });
    },
    { roles: [UserRole.admin] }
  );
}

// ─── PUT — save config ───────────────────────────────────────────────────────

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ botId: string }> }
) {
  return withAuth(
    req,
    async () => {
      const { botId } = await params;

      // Verify bot exists
      const bot = await db.tgBot.findUnique({
        where: { id: botId },
        select: { id: true },
      });
      if (!bot) {
        return NextResponse.json({ error: "Бот не найден" }, { status: 404 });
      }

      const body = await req.json();
      const parsed = configSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Неверный формат данных", details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const data = parsed.data;

      const config = await db.tgBitrixConfig.upsert({
        where: { botId },
        create: {
          botId,
          enabled: data.enabled,
          webhookUrl: data.webhookUrl || null,
          funnelId: data.funnelId,
          defaultStageId: data.defaultStageId,
          contactMappings: data.contactMappings,
          dealMappings: data.dealMappings,
          tagTriggers: data.tagTriggers,
        },
        update: {
          enabled: data.enabled,
          webhookUrl: data.webhookUrl || null,
          funnelId: data.funnelId,
          defaultStageId: data.defaultStageId,
          contactMappings: data.contactMappings,
          dealMappings: data.dealMappings,
          tagTriggers: data.tagTriggers,
        },
      });

      return NextResponse.json({ ok: true, config });
    },
    { roles: [UserRole.admin] }
  );
}

// ─── POST — test connection + fetch funnels & fields ─────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ botId: string }> }
) {
  return withAuth(
    req,
    async () => {
      await params; // consume params (unused but required)

      const body = await req.json();
      const webhookUrl: string =
        body.webhookUrl?.trim() || process.env.BITRIX24_WEBHOOK_URL || "";

      if (!webhookUrl) {
        return NextResponse.json(
          { error: "Укажи Bitrix24 Webhook URL" },
          { status: 400 }
        );
      }

      try {
        const [funnels, dealFields] = await Promise.all([
          fetchBitrixFunnels(webhookUrl),
          fetchBitrixDealFields(webhookUrl),
        ]);

        return NextResponse.json({ ok: true, funnels, dealFields });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json(
          { error: `Ошибка подключения к Bitrix24: ${msg}` },
          { status: 502 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}
