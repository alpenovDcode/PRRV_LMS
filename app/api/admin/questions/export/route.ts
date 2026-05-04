import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole, Prisma } from "@prisma/client";

function parseDate(s: string | null): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

function csvEscape(v: any): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toISOString();
}

function durationSec(a: Date, b: Date | null | undefined): string {
  if (!b) return "";
  return String(Math.max(0, Math.round((b.getTime() - a.getTime()) / 1000)));
}

export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      const url = new URL(request.url);
      const from = parseDate(url.searchParams.get("from"));
      const to = parseDate(url.searchParams.get("to"));
      const curatorId = url.searchParams.get("curatorId") || undefined;
      const groupId = url.searchParams.get("groupId") || undefined;

      const where: Prisma.QuestionWhereInput = {};
      if (from || to) {
        where.createdAt = {};
        if (from) (where.createdAt as any).gte = from;
        if (to) (where.createdAt as any).lte = to;
      }
      if (curatorId) where.curatorId = curatorId;
      if (groupId) where.student = { groupMembers: { some: { groupId } } };

      const questions = await db.question.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
          student: { select: { fullName: true, email: true } },
          curator: { select: { fullName: true, email: true } },
          _count: { select: { messages: true } },
        },
      });

      const headers = [
        "id",
        "created_at",
        "subject",
        "status",
        "student_name",
        "student_email",
        "curator_name",
        "curator_email",
        "first_response_at",
        "time_to_first_response_sec",
        "closed_at",
        "dialog_duration_sec",
        "messages_count",
        "rating",
        "rating_comment",
      ];

      const rows = questions.map((q) => {
        const endTime = q.closedAt || q.updatedAt;
        return [
          q.id,
          fmtDate(q.createdAt),
          q.subject,
          q.status,
          q.student?.fullName || "",
          q.student?.email || "",
          q.curator?.fullName || "",
          q.curator?.email || "",
          fmtDate(q.firstResponseAt),
          durationSec(q.createdAt, q.firstResponseAt),
          fmtDate(q.closedAt),
          durationSec(q.createdAt, endTime),
          q._count.messages,
          q.rating ?? "",
          q.ratingComment || "",
        ].map(csvEscape).join(",");
      });

      const csv = "﻿" + headers.join(",") + "\n" + rows.join("\n");

      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="questions-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    },
    { roles: [UserRole.admin] }
  );
}
