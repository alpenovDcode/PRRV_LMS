import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { saveFile } from "@/lib/storage";
import { validateFile } from "@/lib/file-upload-security";
import { ApiResponse } from "@/types";
import { BRIEF_FILE_TYPES, BriefFileType } from "@/lib/brief";
import { requireTariff, tariffDeniedResponse } from "@/lib/tariff-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Какая категория валидации применима для типа файла в брифе.
// Отзывы могут быть голосовыми (audio) или скриншотами (images) —
// принимаем оба, поэтому валидируем по реальному mime type.
function categoryForType(type: BriefFileType, mime: string) {
  if (type === "education" || type === "materials") {
    if (mime.startsWith("image/")) return "images";
    return "documents";
  }
  if (type === "review") {
    if (mime.startsWith("audio/")) return "audio";
    if (mime.startsWith("image/")) return "images";
    return "documents";
  }
  return "images";
}

// POST /api/brief/files — загрузить файл (FormData).
// Поля: file (File), fileType (BriefFileType), caseId? (string).
export async function POST(request: NextRequest) {
  return withAuth(request, async (req) => {
    try {
      const userId = req.user!.userId;
      const guard = await requireTariff(userId, ["LR"]);
      if (!guard.ok) return tariffDeniedResponse(guard);
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      const fileType = formData.get("fileType") as string | null;
      const caseId = (formData.get("caseId") as string | null) || null;

      if (!file) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "BAD_REQUEST", message: "Файл не предоставлен" } },
          { status: 400 }
        );
      }
      if (!fileType || !BRIEF_FILE_TYPES.includes(fileType as BriefFileType)) {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: { code: "BAD_REQUEST", message: "Неизвестный тип файла" },
          },
          { status: 400 }
        );
      }

      let brief = await db.brief.findUnique({ where: { userId } });
      if (!brief) {
        brief = await db.brief.create({ data: { userId } });
      }
      if (brief.status === "completed") {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: { code: "FORBIDDEN", message: "Бриф уже завершён" },
          },
          { status: 403 }
        );
      }

      // Если передан caseId — проверим, что этот кейс принадлежит этому брифу.
      if (caseId) {
        const c = await db.briefCase.findUnique({ where: { id: caseId } });
        if (!c || c.briefId !== brief.id) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: { code: "BAD_REQUEST", message: "Кейс не найден" },
            },
            { status: 400 }
          );
        }
      }

      const category = categoryForType(fileType as BriefFileType, file.type || "");
      const validation = await validateFile(file, {
        category: category as "images" | "documents" | "audio",
        checkMagicBytes: true,
      });
      if (!validation.valid) {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "BAD_REQUEST",
              message: validation.error || "Файл не прошёл проверку",
            },
          },
          { status: 400 }
        );
      }

      const fileUrl = await saveFile(file, validation.sanitizedFilename);

      const created = await db.briefFile.create({
        data: {
          briefId: brief.id,
          caseId,
          fileType: fileType as BriefFileType,
          fileUrl,
          fileName: validation.sanitizedFilename || file.name,
          mimeType: file.type || null,
          fileSize: file.size,
        },
      });

      return NextResponse.json<ApiResponse>(
        { success: true, data: created },
        { status: 201 }
      );
    } catch (error: any) {
      console.error("Upload brief file error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Не удалось загрузить файл. Попробуйте ещё раз.",
          },
        },
        { status: 500 }
      );
    }
  });
}
