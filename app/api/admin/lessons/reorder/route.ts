import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { z } from "zod";

const reorderSchema = z.object({
  lessonIds: z.array(z.string()).min(1),
});

export async function POST(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      try {
        const body = await request.json();
        const { lessonIds } = reorderSchema.parse(body);

        // Используем транзакцию для атомарного обновления порядка
        // Это гарантирует, что все уроки обновятся одновременно или не обновятся вообще
        await db.$transaction(
          async (tx) => {
            await Promise.all(
              lessonIds.map((lessonId, index) =>
                tx.lesson.update({
                  where: { id: lessonId },
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
        console.error("Reorder lessons error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось изменить порядок уроков",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}

