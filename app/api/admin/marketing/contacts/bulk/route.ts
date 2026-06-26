import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { logAction } from "@/lib/audit";
import { getMarketingEmailProvider } from "@/lib/email/providers/factory";

/**
 * POST /api/admin/marketing/contacts/bulk
 *
 * Массовые действия над выделенными контактами в таблице /admin/marketing/contacts.
 *
 * Body:
 *   { ids: string[], action: "unsubscribe" | "subscribe" | "add_tag" | "remove_tag", tag?: string }
 *
 * Ограничение: до 5000 ids за раз (UI не позволит больше — отдельный safeguard здесь).
 *
 * - unsubscribe: marketingOptOut=true + EmailEvent + push в провайдер (fire-and-forget)
 * - subscribe: возврат подписки (без resubscribe в провайдере — Евгений в Unisender вручную)
 * - add_tag: добавляет тег в emailTags JSON-массиве
 * - remove_tag: удаляет тег из emailTags
 */
const bulkSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(5000),
  action: z.enum(["unsubscribe", "subscribe", "add_tag", "remove_tag"]),
  tag: z.string().min(1).max(100).optional(),
});

export async function POST(request: NextRequest) {
  return withAuth(
    request,
    async (req) => {
      const body = await request.json();
      const data = bulkSchema.parse(body);

      if ((data.action === "add_tag" || data.action === "remove_tag") && !data.tag) {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: { code: "VALIDATION_ERROR", message: "Для add_tag/remove_tag нужен tag" },
          },
          { status: 400 }
        );
      }

      let affected = 0;

      switch (data.action) {
        case "unsubscribe": {
          // Берём только тех кто реально подписан — чтобы не вешать
          // unsubscribedAt задним числом тем кто уже отписан.
          const users = await db.user.findMany({
            where: { id: { in: data.ids }, marketingOptOut: false },
            select: { id: true, email: true },
          });

          const result = await db.user.updateMany({
            where: { id: { in: users.map((u) => u.id) } },
            data: { marketingOptOut: true, unsubscribedAt: new Date() },
          });
          affected = result.count;

          // EmailEvent + provider push для каждого затронутого.
          // Делаем не транзакцией — частичный успех допустим (если провайдер
          // упадёт на одном email, остальные уже отписаны корректно).
          const provider = getMarketingEmailProvider();
          await Promise.all(
            users.map(async (u) => {
              await db.emailEvent.create({
                data: {
                  userId: u.id,
                  email: u.email,
                  type: "unsubscribed",
                  metadata: { source: "admin_bulk", actorId: req.user!.userId },
                },
              });
              if (provider.unsubscribeContact) {
                try {
                  await provider.unsubscribeContact(u.email);
                } catch (e) {
                  console.warn(`[bulk] provider unsubscribe failed for ${u.email}:`, e);
                }
              }
            })
          );
          break;
        }

        case "subscribe": {
          const result = await db.user.updateMany({
            where: { id: { in: data.ids }, marketingOptOut: true },
            data: { marketingOptOut: false, unsubscribedAt: null },
          });
          affected = result.count;
          break;
        }

        case "add_tag": {
          // emailTags хранится как Json — Prisma не умеет push-в-массив через
          // updateMany. Берём id'шники → читаем emailTags → собираем новый
          // → updateMany по id. Чтобы не делать N запросов, разбиваем на
          // батчи по 500 и обновляем каждый отдельно.
          const tag = data.tag!.trim();
          const users = await db.user.findMany({
            where: { id: { in: data.ids } },
            select: { id: true, emailTags: true },
          });
          await Promise.all(
            users.map(async (u) => {
              const current = Array.isArray(u.emailTags) ? (u.emailTags as string[]) : [];
              if (current.includes(tag)) return;
              await db.user.update({
                where: { id: u.id },
                data: { emailTags: [...current, tag] },
              });
              affected++;
            })
          );
          break;
        }

        case "remove_tag": {
          const tag = data.tag!.trim();
          const users = await db.user.findMany({
            where: { id: { in: data.ids } },
            select: { id: true, emailTags: true },
          });
          await Promise.all(
            users.map(async (u) => {
              const current = Array.isArray(u.emailTags) ? (u.emailTags as string[]) : [];
              if (!current.includes(tag)) return;
              await db.user.update({
                where: { id: u.id },
                data: { emailTags: current.filter((t) => t !== tag) },
              });
              affected++;
            })
          );
          break;
        }
      }

      await logAction(
        req.user!.userId,
        `MARKETING_CONTACTS_BULK_${data.action.toUpperCase()}`,
        "User",
        undefined,
        { requested: data.ids.length, affected, tag: data.tag }
      );

      return NextResponse.json<ApiResponse>({
        success: true,
        data: { affected, requested: data.ids.length },
      });
    },
    { roles: [UserRole.admin] }
  );
}
