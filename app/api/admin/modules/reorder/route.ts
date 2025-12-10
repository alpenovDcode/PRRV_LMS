import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { z } from "zod";

const reorderSchema = z.object({
  moduleIds: z.array(z.string()).min(1),
});

export async function POST(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      try {
        const body = await request.json();
        const { moduleIds } = reorderSchema.parse(body);

        // Используем транзакцию для атомарного обновления порядка
        await db.$transaction(
          async (tx) => {
            await Promise.all(
              moduleIds.map((moduleId, index) =>
                tx.module.update({
                  where: { id: moduleId },
                  data: { orderIndex: index },
                })
              )
            );
          },
          {
            isolationLevel: "Serializable",
          }
        );

        return NextResponse.json<ApiResponse>({ success: true }, { status: 200 });
      } catch (error) {
        console.error("Reorder modules error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось изменить порядок модулей",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}

