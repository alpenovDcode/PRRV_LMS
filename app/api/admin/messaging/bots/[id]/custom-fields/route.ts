import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { z } from "zod";

const createSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z_][a-z0-9_]*$/i, "Только латиница, цифры и _, начинается с буквы"),
  label: z.string().min(1).max(100),
  type: z.enum(["text", "number", "date", "email", "phone", "url", "bool", "select"]).default("text"),
  options: z.array(z.string().max(100)).max(50).default([]),
  required: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

/** GET /api/admin/messaging/bots/[id]/custom-fields */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    req,
    async () => {
      const { id } = await params;
      const fields = await db.messagingCustomField.findMany({
        where: { botId: id },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });
      return NextResponse.json({ success: true, data: fields });
    },
    { roles: [UserRole.admin] }
  );
}

/** POST /api/admin/messaging/bots/[id]/custom-fields */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    req,
    async () => {
      const { id } = await params;
      const body = await req.json().catch(() => null);
      const parsed = createSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: parsed.error.errors[0]?.message ?? "Некорректные данные" },
          { status: 400 }
        );
      }

      try {
        const field = await db.messagingCustomField.create({
          data: { botId: id, ...parsed.data },
        });
        return NextResponse.json({ success: true, data: field }, { status: 201 });
      } catch (e: any) {
        if (e.code === "P2002") {
          return NextResponse.json(
            { success: false, error: `Поле с ключом "${parsed.data.key}" уже существует` },
            { status: 400 }
          );
        }
        throw e;
      }
    },
    { roles: [UserRole.admin] }
  );
}
