import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { ApiResponse } from "@/types";
import { createNotification } from "@/lib/notifications";

export async function POST(request: NextRequest) {
  return withAuth(
    request,
    async (_) => {
      try {
        const body = await request.json();
        const { title, message, targetRole } = body;

        if (!title || !message) {
          return NextResponse.json<ApiResponse>(
            { success: false, error: { code: "BAD_REQUEST", message: "Title and message are required" } },
            { status: 400 }
          );
        }

        // Determine target users
        const whereClause: any = {};
        if (targetRole && targetRole !== "all") {
          whereClause.role = targetRole;
        }

        const users = await db.user.findMany({
          where: whereClause,
          select: { id: true },
        });

        // Send notifications in batches to avoid overwhelming DB
        // In a real production app, this should be a background job (Queue)
        const BATCH_SIZE = 50;
        for (let i = 0; i < users.length; i += BATCH_SIZE) {
          const batch = users.slice(i, i + BATCH_SIZE);
          await Promise.all(
            batch.map((user) =>
              createNotification(
                user.id,
                "broadcast",
                title,
                message,
                "/dashboard" // Default link
              )
            )
          );
        }

        return NextResponse.json<ApiResponse>({
          success: true,
          data: { 
            message: "Broadcast sent successfully",
            recipientCount: users.length 
          },
        });
      } catch (error) {
        console.error("Broadcast error:", error);
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to send broadcast" } },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
