import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { z } from "zod";

const forceOpenSchema = z.object({
  moduleId: z.string().uuid(),
  groupId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  return withAuth(
    request,
    async (req) => {
      try {
        const body = await request.json();
        const { moduleId, groupId } = forceOpenSchema.parse(body);

        // 1. Get the module to find the course
        const module = await db.module.findUnique({
             where: { id: moduleId }
        });
        
        if (!module) {
            return NextResponse.json<ApiResponse>(
                { success: false, error: { code: "NOT_FOUND", message: "Модуль не найден" } },
                { status: 404 }
            );
        }

        // 2. Find all user IDs in this group
        const groupMembers = await db.groupMember.findMany({
            where: { groupId }
        });
        
        const userIds = groupMembers.map(gm => gm.userId);
        
        if (userIds.length === 0) {
            return NextResponse.json<ApiResponse>(
                { success: true, data: { message: "В группе нет пользователей" } },
                { status: 200 }
            );
        }

        // 3. Update Enrollments for these users in the module's course
        // Add moduleId to forcedModules if it's not already there.
        // Prisma doesn't have array append in updateMany across the board, so we do it in a loop for safety,
        // or fetch first. Given it's admin action, looping is acceptable.
        
        let updateCount = 0;
        
        for (const uid of userIds) {
             const enrollment = await db.enrollment.findUnique({
                 where: {
                     userId_courseId: {
                         userId: uid,
                         courseId: module.courseId
                     }
                 }
             });
             
             if (enrollment) {
                 const currentForced = enrollment.forcedModules || [];
                 if (!currentForced.includes(moduleId)) {
                     await db.enrollment.update({
                         where: { id: enrollment.id },
                         data: {
                             forcedModules: [...currentForced, moduleId]
                         }
                     });
                     updateCount++;
                 }
             }
        }

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: { message: `Модуль успешно открыт для ${updateCount} пользователей группы` },
          },
          { status: 200 }
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
             return NextResponse.json<ApiResponse>(
                 { success: false, error: { code: "VALIDATION_ERROR", message: "Неверные данные" } },
                 { status: 400 }
             );
        }
        
        console.error("Failed to force open module:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось принудительно открыть модуль",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: ["admin", "curator"] }
  );
}
