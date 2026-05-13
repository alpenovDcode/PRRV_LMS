// CRUD for TgCustomField. Defines per-bot typed schema for the
// TgSubscriber.customFields JSON bag.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIELD_TYPES = [
  "text",
  "number",
  "date",
  "email",
  "phone",
  "select",
  "boolean",
  "url",
] as const;

const optionsSchema = z
  .array(
    z.object({
      value: z.string().min(1),
      label: z.string().min(1),
    })
  )
  .optional();

const createSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(64)
    .regex(
      /^[a-z][a-z0-9_]*$/,
      "Key must start with a letter and contain only [a-z0-9_]"
    ),
  label: z.string().min(1).max(120),
  type: z.enum(FIELD_TYPES),
  description: z.string().max(500).optional(),
  options: optionsSchema,
  validationRegex: z.string().max(500).nullable().optional(),
  isRequired: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function GET(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async () => {
      const fields = await db.tgCustomField.findMany({
        where: { botId: params.botId },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });
      return NextResponse.json({ success: true, data: { fields } });
    },
    { roles: ["admin"] }
  );
}

export async function POST(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async (req) => {
      const body = await req.json().catch(() => null);
      const parsed = createSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: { code: "VALIDATION", message: parsed.error.message } },
          { status: 400 }
        );
      }
      // For select type, options must have at least one entry.
      if (parsed.data.type === "select" && (parsed.data.options ?? []).length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "VALIDATION",
              message: "Поле типа 'select' требует минимум один вариант",
            },
          },
          { status: 400 }
        );
      }
      try {
        const created = await db.tgCustomField.create({
          data: {
            botId: params.botId,
            ...parsed.data,
            options: parsed.data.options ?? [],
          },
        });
        return NextResponse.json({ success: true, data: created });
      } catch (e: any) {
        if (e?.code === "P2002") {
          return NextResponse.json(
            {
              success: false,
              error: { code: "CONFLICT", message: "Поле с таким ключом уже есть" },
            },
            { status: 409 }
          );
        }
        throw e;
      }
    },
    { roles: ["admin"] }
  );
}
