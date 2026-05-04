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

        const orFilters: any[] = [];
        if (targets.roles && targets.roles.length > 0) orFilters.push({ role: { in: targets.roles } });
        if (targets.groupIds && targets.groupIds.length > 0) orFilters.push({ groupMembers: { some: { groupId: { in: targets.groupIds } } } });
        if (targets.tariffs && targets.tariffs.length > 0) orFilters.push({ tariff: { in: targets.tariffs } });
        if (targets.tracks && targets.tracks.length > 0) orFilters.push({ track: { in: targets.tracks } });

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

        // Per-recipient log map
        const logs = new Map<string, {
          userId: string;
          email: string | null;
          lmsStatus: string | null;
          emailStatus: string | null;
          errors: string[];
        }>();
        for (const u of users) {
          logs.set(u.id, {
            userId: u.id,
            email: u.email || null,
            lmsStatus: validChannels.includes("lms") ? "pending" : null,
            emailStatus: validChannels.includes("email") ? "pending" : null,
            errors: [],
          });
        }

        let sentCount = 0;
        let failedCount = 0;

        if (validChannels.includes("lms")) {
          for (let i = 0; i < users.length; i += LMS_BATCH_SIZE) {
            const batch = users.slice(i, i + LMS_BATCH_SIZE);
            const results = await Promise.allSettled(
              batch.map((u) => createNotification(u.id, "broadcast", title, message, "/dashboard"))
            );
            results.forEach((r, idx) => {
              const u = batch[idx];
              const log = logs.get(u.id)!;
              if (r.status === "fulfilled") {
                log.lmsStatus = "sent";
                sentCount++;
              } else {
                log.lmsStatus = "failed";
                log.errors.push(`lms: ${(r as any).reason?.message || "error"}`);
                failedCount++;
              }
            });
          }
        }

        if (validChannels.includes("email")) {
          const html = emailTemplates.broadcast(title, message);
          for (let i = 0; i < users.length; i += EMAIL_BATCH_SIZE) {
            const batch = users.slice(i, i + EMAIL_BATCH_SIZE);
            const results = await Promise.allSettled(
              batch.map((u) => {
                if (!u.email) return Promise.reject(new Error("no email"));
                return sendEmail({ to: u.email, subject: title, html });
              })
            );
            results.forEach((r, idx) => {
              const u = batch[idx];
              const log = logs.get(u.id)!;
              if (r.status === "fulfilled") {
                log.emailStatus = "sent";
              } else {
                log.emailStatus = u.email ? "failed" : "skipped";
                log.errors.push(`email: ${(r as any).reason?.message || "error"}`);
                if (u.email) failedCount++;
              }
            });
          }
        }

        // Persist per-recipient logs in chunks
        const logArr = Array.from(logs.values()).map((l) => ({
          broadcastId: broadcast.id,
          userId: l.userId,
          email: l.email,
          lmsStatus: l.lmsStatus,
          emailStatus: l.emailStatus,
          errorMessage: l.errors.length > 0 ? l.errors.join("; ").slice(0, 500) : null,
        }));
        for (let i = 0; i < logArr.length; i += 200) {
          await db.broadcastRecipient.createMany({ data: logArr.slice(i, i + 200) });
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
