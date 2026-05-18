import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { deleteFile } from "@/lib/storage";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";

export const dynamic = "force-dynamic";

// GET /api/admin/briefs/[id] — полный бриф с кейсами и файлами.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withAuth(
    request,
    async () => {
      try {
        const brief = await db.brief.findUnique({
          where: { id },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                fullName: true,
                avatarUrl: true,
                phone: true,
                telegram: true,
              },
            },
            cases: {
              orderBy: { orderIndex: "asc" },
              include: { files: true },
            },
            files: { orderBy: { createdAt: "asc" } },
          },
        });

        if (!brief) {
          return NextResponse.json<ApiResponse>(
            { success: false, error: { code: "NOT_FOUND", message: "Бриф не найден" } },
            { status: 404 }
          );
        }

        return NextResponse.json<ApiResponse>(
          { success: true, data: brief },
          { status: 200 }
        );
      } catch (error) {
        console.error("Admin get brief error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: { code: "INTERNAL_ERROR", message: "Не удалось загрузить бриф" },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}

// DELETE /api/admin/briefs/[id] — удалить бриф ученика полностью
// (вместе с кейсами и файлами; файлы из стораджа удаляем best-effort).
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withAuth(
    request,
    async () => {
      try {
        const brief = await db.brief.findUnique({
          where: { id },
          include: { files: { select: { fileUrl: true } } },
        });
        if (!brief) {
          return NextResponse.json<ApiResponse>(
            { success: false, error: { code: "NOT_FOUND", message: "Бриф не найден" } },
            { status: 404 }
          );
        }

        await db.brief.delete({ where: { id } });

        await Promise.all(
          brief.files.map((f) => deleteFile(f.fileUrl).catch(() => null))
        );

        return NextResponse.json<ApiResponse>({ success: true }, { status: 200 });
      } catch (error) {
        console.error("Admin delete brief error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: { code: "INTERNAL_ERROR", message: "Не удалось удалить бриф" },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}
