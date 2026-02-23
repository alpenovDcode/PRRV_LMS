import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { adminGroupCreateSchema } from "@/lib/validations";
import { logAction } from "@/lib/audit";

export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      try {
        const groups = await db.group.findMany({
          include: {
            _count: {
              select: { members: true },
            },
            course: {
              select: { title: true },
            },
          },
          orderBy: { createdAt: "desc" },
        });

        return NextResponse.json<ApiResponse>({ success: true, data: groups }, { status: 200 });
      } catch (error) {
        console.error("Admin groups error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось получить список групп",
            },
          },
          { status: 500 }
        );
      }
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
        const { name, description, courseId, startDate } = adminGroupCreateSchema.parse(body);

        const group = await db.group.create({
          data: {
            name,
            description,
            courseId: courseId || null,
            startDate: startDate || null,
          },
        });

        // Audit log
        await logAction(req.user!.userId, "CREATE_GROUP", "group", group.id, {
          name: group.name,
        });

        return NextResponse.json<ApiResponse>({ success: true, data: group }, { status: 201 });
      } catch (error) {
        console.error("Create group error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось создать группу",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}


