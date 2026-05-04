import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";

function csvEscape(v: any): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return withAuth(
    request,
    async () => {
      const { id } = await context.params;
      const broadcast = await db.broadcast.findUnique({
        where: { id },
        include: {
          recipientLogs: {
            include: { user: { select: { fullName: true, email: true, role: true } } },
            orderBy: { createdAt: "asc" },
          },
        },
      });
      if (!broadcast) {
        return new NextResponse("Not found", { status: 404 });
      }

      const headers = ["user_id", "full_name", "email", "role", "lms_status", "email_status", "error_message", "created_at"];
      const rows = broadcast.recipientLogs.map((r) =>
        [
          r.userId,
          r.user?.fullName || "",
          r.email || r.user?.email || "",
          r.user?.role || "",
          r.lmsStatus || "",
          r.emailStatus || "",
          r.errorMessage || "",
          r.createdAt.toISOString(),
        ].map(csvEscape).join(",")
      );

      const csv = "﻿" + headers.join(",") + "\n" + rows.join("\n");
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="broadcast-${id}.csv"`,
        },
      });
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
