import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { UserRole } from "@prisma/client";
import { ApiResponse } from "@/types";

export async function POST(request: NextRequest) {
  return withAuth(request, async (req) => {
    try {
      const body = await request.json();
      const { subject, message } = body;

      if (!subject || !message) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "BAD_REQUEST", message: "Subject and message are required" } },
          { status: 400 }
        );
      }

      const user = req.user!;

      // Find all admins
      const admins = await db.user.findMany({
        where: { role: UserRole.admin },
        select: { id: true },
      });

      // Notify all admins
      await Promise.all(
        admins.map((admin) =>
          createNotification(
            admin.id,
            "support_request",
            `Новый запрос в поддержку: ${subject}`,
            `От пользователя ${user.email}: ${message.substring(0, 100)}...`,
            `/admin/users/${user.userId}` // Link to user profile for context
          )
        )
      );

      // Ideally, we would also save this to a SupportTicket table or send an email via Resend/SendGrid.
      // For now, notifications are a good MVP.

      return NextResponse.json<ApiResponse>({
        success: true,
        data: { message: "Support request sent" },
      });
    } catch (error) {
      console.error("Support request error:", error);
      return NextResponse.json<ApiResponse>(
        { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to send support request" } },
        { status: 500 }
      );
    }
  });
}
