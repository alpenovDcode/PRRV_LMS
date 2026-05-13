import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async () => {
      const links = await db.tgTrackingLink.findMany({
        where: { botId: params.botId },
        orderBy: { createdAt: "desc" },
      });
      const bot = await db.tgBot.findUnique({
        where: { id: params.botId },
        select: { username: true },
      });
      return NextResponse.json({ success: true, data: { links, botUsername: bot?.username } });
    },
    { roles: ["admin"] }
  );
}

// Telegram /start payload is limited to 64 chars and only [A-Za-z0-9_-].
const slugSchema = z
  .string()
  .min(1)
  .max(48)
  .regex(/^[A-Za-z0-9_-]+$/, "Slug must match [A-Za-z0-9_-]");

const createSchema = z.object({
  slug: slugSchema,
  name: z.string().min(1).max(120),
  startFlowId: z.string().nullable().optional(),
  applyTags: z.array(z.string()).optional(),
  utm: z.record(z.string(), z.string()).optional(),
  expiresAt: z.coerce.date().optional(),
});

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
          { success: false, error: { code: "BAD_INPUT", message: parsed.error.message } },
          { status: 400 }
        );
      }
      try {
        const link = await db.tgTrackingLink.create({
          data: {
            botId: params.botId,
            slug: parsed.data.slug,
            name: parsed.data.name,
            startFlowId: parsed.data.startFlowId ?? null,
            applyTags: parsed.data.applyTags ?? [],
            utm: (parsed.data.utm ?? {}) as object,
            expiresAt: parsed.data.expiresAt,
          },
        });
        return NextResponse.json({ success: true, data: link });
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (code === "P2002") {
          return NextResponse.json(
            { success: false, error: { code: "DUPLICATE_SLUG", message: "Slug already in use" } },
            { status: 409 }
          );
        }
        throw e;
      }
    },
    { roles: ["admin"] }
  );
}
