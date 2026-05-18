import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { briefCaseUpdateSchema } from "@/lib/brief";

export const dynamic = "force-dynamic";

async function loadCaseOrForbidden(caseId: string, userId: string) {
  const briefCase = await db.briefCase.findUnique({
    where: { id: caseId },
    include: { brief: { select: { userId: true, status: true } } },
  });
  if (!briefCase || briefCase.brief.userId !== userId) {
    return { error: "NOT_FOUND" as const };
  }
  if (briefCase.brief.status === "completed") {
    return { error: "FORBIDDEN" as const };
  }
  return { briefCase };
}

// PATCH /api/brief/cases/[caseId] — обновить поля одного кейса.
export async function PATCH(
  request: NextRequest,
  { params }: { params: { caseId: string } }
) {
  return withAuth(request, async (req) => {
    try {
      const userId = req.user!.userId;
      const guard = await loadCaseOrForbidden(params.caseId, userId);
      if (guard.error === "NOT_FOUND") {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "NOT_FOUND", message: "Кейс не найден" } },
          { status: 404 }
        );
      }
      if (guard.error === "FORBIDDEN") {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "FORBIDDEN", message: "Бриф уже завершён" } },
          { status: 403 }
        );
      }

      const body = await request.json();
      const parsed = briefCaseUpdateSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "BAD_REQUEST",
              message: parsed.error.errors[0]?.message || "Некорректные данные",
            },
          },
          { status: 400 }
        );
      }

      const updated = await db.briefCase.update({
        where: { id: params.caseId },
        data: parsed.data,
      });

      return NextResponse.json<ApiResponse>(
        { success: true, data: updated },
        { status: 200 }
      );
    } catch (error) {
      console.error("Update brief case error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: { code: "INTERNAL_ERROR", message: "Не удалось сохранить кейс" },
        },
        { status: 500 }
      );
    }
  });
}

// DELETE /api/brief/cases/[caseId] — удалить кейс (файлы отзыва от него
// тоже удалятся каскадом briefId, либо отвяжутся через case_id=null —
// см. SetNull в схеме).
export async function DELETE(
  request: NextRequest,
  { params }: { params: { caseId: string } }
) {
  return withAuth(request, async (req) => {
    try {
      const userId = req.user!.userId;
      const guard = await loadCaseOrForbidden(params.caseId, userId);
      if (guard.error === "NOT_FOUND") {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "NOT_FOUND", message: "Кейс не найден" } },
          { status: 404 }
        );
      }
      if (guard.error === "FORBIDDEN") {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "FORBIDDEN", message: "Бриф уже завершён" } },
          { status: 403 }
        );
      }

      await db.briefCase.delete({ where: { id: params.caseId } });
      return NextResponse.json<ApiResponse>({ success: true }, { status: 200 });
    } catch (error) {
      console.error("Delete brief case error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: { code: "INTERNAL_ERROR", message: "Не удалось удалить кейс" },
        },
        { status: 500 }
      );
    }
  });
}
