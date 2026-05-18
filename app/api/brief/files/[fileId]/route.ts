import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { deleteFile } from "@/lib/storage";
import { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";

// DELETE /api/brief/files/[fileId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: { fileId: string } }
) {
  return withAuth(request, async (req) => {
    try {
      const userId = req.user!.userId;
      const file = await db.briefFile.findUnique({
        where: { id: params.fileId },
        include: { brief: { select: { userId: true, status: true } } },
      });
      if (!file || file.brief.userId !== userId) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "NOT_FOUND", message: "Файл не найден" } },
          { status: 404 }
        );
      }
      if (file.brief.status === "completed") {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: { code: "FORBIDDEN", message: "Бриф уже завершён" },
          },
          { status: 403 }
        );
      }

      await db.briefFile.delete({ where: { id: params.fileId } });
      // Best-effort удаление из стораджа — игнорируем ошибки.
      await deleteFile(file.fileUrl).catch(() => null);

      return NextResponse.json<ApiResponse>({ success: true }, { status: 200 });
    } catch (error) {
      console.error("Delete brief file error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: { code: "INTERNAL_ERROR", message: "Не удалось удалить файл" },
        },
        { status: 500 }
      );
    }
  });
}
