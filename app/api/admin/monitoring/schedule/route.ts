import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";

export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async (req) => {
      try {
        // Fetch all modules that use group_start_date or openAt
        const modules = await db.module.findMany({
          where: {
            OR: [
              { openAfterEvent: "group_start_date" },
              { openAt: { not: null } },
            ],
          },
          include: {
            course: {
              select: { title: true },
            },
          },
          orderBy: {
            courseId: "asc",
          },
        });

        // We also need all groups and their start dates to match with modules
        // For 'openAfterEvent === "group_start_date"', a module is scheduled per group it's allowed for.
        // If 'allowedGroups' is empty, it theoretically applies to all groups in that course.
        
        const scheduleItems = [];
        
        for (const module of modules) {
             let pertinentGroups = [];
             
             if (module.allowedGroups && module.allowedGroups.length > 0) {
                 pertinentGroups = await db.group.findMany({
                     where: { id: { in: module.allowedGroups } }
                 });
             } else {
                 pertinentGroups = await db.group.findMany({
                     where: { courseId: module.courseId }
                 });
             }
             
             // Absolute date case
             if (module.openAt) {
                  for (const group of pertinentGroups) {
                       const openDate = new Date(module.openAt);
                       const status = new Date() >= openDate ? "opened" : "waiting";
                       
                       scheduleItems.push({
                           moduleId: module.id,
                           moduleTitle: module.title,
                           courseTitle: module.course.title,
                           groupId: group.id,
                           groupName: group.name,
                           expectedOpenDate: openDate.toISOString(),
                           status,
                       });
                  }
             } else if (module.openAfterEvent === "group_start_date") {
                  for (const group of pertinentGroups) {
                      if (!group.startDate) {
                           scheduleItems.push({
                               moduleId: module.id,
                               moduleTitle: module.title,
                               courseTitle: module.course.title,
                               groupId: group.id,
                               groupName: group.name,
                               expectedOpenDate: null,
                               status: "error_no_date",
                           });
                      } else {
                           let openDate = new Date(group.startDate);
                           if (module.openAfterAmount && module.openAfterUnit) {
                                // We need a backend safe addTime function, or implement it here.
                                // We'll implement a simple version if addTime from utils is client-only.
                                if (module.openAfterUnit === "days") {
                                    openDate.setDate(openDate.getDate() + module.openAfterAmount);
                                } else if (module.openAfterUnit === "weeks") {
                                    openDate.setDate(openDate.getDate() + (module.openAfterAmount * 7));
                                } else if (module.openAfterUnit === "months") {
                                    openDate.setMonth(openDate.getMonth() + module.openAfterAmount);
                                }
                           }
                           
                           const status = new Date() >= openDate ? "opened" : "waiting";
                           
                           scheduleItems.push({
                               moduleId: module.id,
                               moduleTitle: module.title,
                               courseTitle: module.course.title,
                               groupId: group.id,
                               groupName: group.name,
                               expectedOpenDate: openDate.toISOString(),
                               status,
                           });
                      }
                  }
             }
        }
        

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: scheduleItems,
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("Failed to fetch schedule:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось загрузить расписание",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: ["admin", "curator"] }
  );
}
