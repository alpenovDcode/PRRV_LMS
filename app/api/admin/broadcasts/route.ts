import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole, UserTariff } from "@prisma/client";
import { ApiResponse } from "@/types";
import { createNotification } from "@/lib/notifications";
import { sendEmail, emailTemplates } from "@/lib/email-service";

const EMAIL_BATCH_SIZE = 50;
const LMS_BATCH_SIZE = 50;

interface BroadcastTargets {
  roles?: UserRole[];
  groupIds?: string[];
  tariffs?: UserTariff[];
  tracks?: string[];
}

export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      const items = await db.broadcast.findMany({
        orderBy: { sentAt: "desc" },
        take: 50,
        include: {
          author: { select: { fullName: true, email: true } },
        },
      });
      return NextResponse.json<ApiResponse>({ success: true, data: { items } });
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}

export async function POST(request: NextRequest) {
  return withAuth(
    request,
    async (req) => {
      try {
        const body = await request.json();
        const {
          title,
          message,
          channels = ["lms"],
          targets = {},
        }: {
          title: string;
          message: string;
          channels: string[];
          targets: BroadcastTargets;
        } = body;

        if (!title || !message) {
          return NextResponse.json<ApiResponse>(
            { success: false, error: { code: "BAD_REQUEST", message: "Заголовок и текст обязательны" } },
            { status: 400 }
          );
        }

        const validChannels = channels.filter((c) => ["lms", "email"].includes(c));
        if (validChannels.length === 0) {
          return NextResponse.json<ApiResponse>(
            { success: false, error: { code: "BAD_REQUEST", message: "Выберите хотя бы один канал" } },
            { status: 400 }
          );
        }

        // Build audience: union of (roles, groupIds, tariffs, tracks). distinct by id.
        const orFilters: any[] = [];
        if (targets.roles && targets.roles.length > 0) {
          orFilters.push({ role: { in: targets.roles } });
        }
        if (targets.groupIds && targets.groupIds.length > 0) {
          orFilters.push({ groupMembers: { some: { groupId: { in: targets.groupIds } } } });
        }
        if (targets.tariffs && targets.tariffs.length > 0) {
          orFilters.push({ tariff: { in: targets.tariffs } });
        }
        if (targets.tracks && targets.tracks.length > 0) {
          orFilters.push({ track: { in: targets.tracks } });
        }

        const where = orFilters.length > 0 ? { OR: orFilters, isBlocked: false } : { isBlocked: false };

        const users = await db.user.findMany({
          where,
          select: { id: true, email: true, fullName: true },
          distinct: ["id"],
        });

        const broadcast = await db.broadcast.create({
          data: {
            authorId: req.user!.userId,
            title,
            message,
            channels: validChannels,
            targets: targets as any,
            recipients: users.length,
            status: "sending",
          },
        });

        let sentCount = 0;
        let failedCount = 0;

        // LMS notifications in batches
        if (validChannels.includes("lms")) {
          for (let i = 0; i < users.length; i += LMS_BATCH_SIZE) {
            const batch = users.slice(i, i + LMS_BATCH_SIZE);
            const results = await Promise.allSettled(
              batch.map((u) => createNotification(u.id, "broadcast", title, message, "/dashboard"))
            );
            sentCount += results.filter((r) => r.status === "fulfilled").length;
            failedCount += results.filter((r) => r.status === "rejected").length;
          }
        }

        // Email notifications in batches of 50
        if (validChannels.includes("email")) {
          const html = emailTemplates.broadcast(title, message);
          for (let i = 0; i < users.length; i += EMAIL_BATCH_SIZE) {
            const batch = users.slice(i, i + EMAIL_BATCH_SIZE);
            const results = await Promise.allSettled(
              batch
                .filter((u) => u.email)
                .map((u) => sendEmail({ to: u.email, subject: title, html }))
            );
            failedCount += results.filter((r) => r.status === "rejected").length;
          }
        }

        await db.broadcast.update({
          where: { id: broadcast.id },
          data: {
            sentCount,
            failedCount,
            status: failedCount > 0 && sentCount === 0 ? "failed" : "completed",
          },
        });

        return NextResponse.json<ApiResponse>({
          success: true,
          data: {
            broadcastId: broadcast.id,
            recipientCount: users.length,
            channels: validChannels,
          },
        });
      } catch (error) {
        console.error("Broadcast error:", error);
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "INTERNAL_ERROR", message: "Не удалось отправить рассылку" } },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
