import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { briefUpdateSchema } from "@/lib/brief";

export const dynamic = "force-dynamic";

// GET /api/brief — мой бриф. Если его ещё нет — создать пустой черновик.
export async function GET(request: NextRequest) {
  return withAuth(request, async (req) => {
    try {
      const userId = req.user!.userId;

      let brief = await db.brief.findUnique({
        where: { userId },
        include: {
          cases: { orderBy: { orderIndex: "asc" } },
          files: { orderBy: { createdAt: "asc" } },
        },
      });

      if (!brief) {
        brief = await db.brief.create({
          data: { userId },
          include: {
            cases: { orderBy: { orderIndex: "asc" } },
            files: { orderBy: { createdAt: "asc" } },
          },
        });
      }

      return NextResponse.json<ApiResponse>(
        { success: true, data: brief },
        { status: 200 }
      );
    } catch (error) {
      console.error("Get brief error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: { code: "INTERNAL_ERROR", message: "Не удалось загрузить бриф" },
        },
        { status: 500 }
      );
    }
  });
}

// PATCH /api/brief — обновить поля брифа.
export async function PATCH(request: NextRequest) {
  return withAuth(request, async (req) => {
    try {
      const userId = req.user!.userId;
      const body = await request.json();
      const parsed = briefUpdateSchema.safeParse(body);

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

      // Запрещаем редактирование уже завершённого брифа — кроме явного
      // возврата в редактирование через POST /api/brief/reopen.
      const existing = await db.brief.findUnique({ where: { userId } });
      if (!existing) {
        await db.brief.create({ data: { userId } });
      } else if (existing.status === "completed") {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "FORBIDDEN",
              message: "Бриф уже завершён. Откройте его заново для редактирования.",
            },
          },
          { status: 403 }
        );
      }

      const updated = await db.brief.update({
        where: { userId },
        data: parsed.data,
        include: {
          cases: { orderBy: { orderIndex: "asc" } },
          files: { orderBy: { createdAt: "asc" } },
        },
      });

      return NextResponse.json<ApiResponse>(
        { success: true, data: updated },
        { status: 200 }
      );
    } catch (error) {
      console.error("Update brief error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: { code: "INTERNAL_ERROR", message: "Не удалось сохранить изменения" },
        },
        { status: 500 }
      );
    }
  });
}

// DELETE /api/brief — начать заново (удалить старый бриф вместе с кейсами
// и файлами; файлы из стораджа не удаляем — оставляем «осиротевшими» в R2,
// аналогично тому, как это делает Python-бот при start_new_brief).
export async function DELETE(request: NextRequest) {
  return withAuth(request, async (req) => {
    try {
      const userId = req.user!.userId;
      await db.brief.deleteMany({ where: { userId } });
      const fresh = await db.brief.create({
        data: { userId },
        include: { cases: true, files: true },
      });
      return NextResponse.json<ApiResponse>(
        { success: true, data: fresh },
        { status: 200 }
      );
    } catch (error) {
      console.error("Reset brief error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: { code: "INTERNAL_ERROR", message: "Не удалось начать заново" },
        },
        { status: 500 }
      );
    }
  });
}
