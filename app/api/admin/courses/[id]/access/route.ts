import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { checkModuleAccess, ModuleAccessContext } from "@/lib/lms-logic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req) => {
    try {
      const { id: courseId } = await params;
      const { searchParams } = new URL(request.url);
      const moduleId = searchParams.get("moduleId");

      if (!moduleId) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "MISSING_PARAM", message: "moduleId is required" } },
          { status: 400 }
        );
      }

      // 1. Fetch Course & Module logic
      const course = await db.course.findUnique({
        where: { id: courseId },
        include: {
            modules: {
                where: { id: moduleId },
                select: {
                    id: true,
                    title: true,
                    allowedTariffs: true,
                    allowedTracks: true,
                    allowedGroups: true,
                    openAt: true,
                    openAfterAmount: true,
                    openAfterUnit: true,
                    openAfterEvent: true,
                    trackSettings: true,
                }
            }
        }
      });

      if (!course || course.modules.length === 0) {
        return NextResponse.json<ApiResponse>(
            { success: false, error: { code: "NOT_FOUND", message: "Course or Module not found" } },
            { status: 404 }
        );
      }
      
      const module = course.modules[0];

      // 2. Fetch all enrolled users and their context
      const enrollments = await db.enrollment.findMany({
        where: { 
            courseId: courseId,
            status: "active" 
        },
        include: {
            user: {
                include: {
                    groupMembers: {
                        include: {
                            group: {
                                select: {
                                    id: true,
                                    startDate: true
                                }
                            }
                        }
                    },
                    // Fetch LAST completed track definition lesson
                    progress: {
                        where: {
                            lesson: { type: "track_definition" },
                            status: "completed"
                        },
                        orderBy: { completedAt: "desc" },
                        take: 1
                    }
                }
            }
        }
      });

      const accessResults = enrollments.map((enrollment: any) => {
          const user = enrollment.user;
          if (!user) return null; // Should not happen due to relation

          const userGroupIds = user.groupMembers.map((gm: any) => gm.groupId);
          const userGroupsMap = new Map<string, Date | null>();
          user.groupMembers.forEach((gm: any) => {
            userGroupsMap.set(gm.groupId, gm.group.startDate ? new Date(gm.group.startDate) : null);
          });
          
          const trackDefinitionCompletedAt = user.progress?.[0]?.completedAt ? new Date(user.progress[0].completedAt) : null;

          const context: ModuleAccessContext = {
              userTariff: user.tariff,
              userTrack: user.track,
              userGroupIds,
              userGroupsMap,
              trackDefinitionCompletedAt
          };

          // Apply track specific logic if exists
          let effectiveModule = { ...module };
          if (user.track && module.trackSettings) {
             const settings = (module.trackSettings as Record<string, any>)[user.track];
             if (settings) {
                 // Override defaults if track setting exists
                 if (settings.openAt) effectiveModule.openAt = settings.openAt;
                 if (settings.openAfterEvent) {
                     effectiveModule.openAfterEvent = settings.openAfterEvent;
                     effectiveModule.openAfterAmount = settings.openAfterAmount;
                     effectiveModule.openAfterUnit = settings.openAfterUnit;
                 } else {
                     // If explicit null, means "Default/Immediately"? Or fall back to module default?
                     // In the UI we toggle it. If unchecked -> null.
                     // A null track setting usually means "no override", but here if we checked the box it writes values.
                     // If we uncheck, it writes null.
                     // If track settings are PRESENT but fields are null, it might mean "override to nothing" or "no override".
                     // Let's assume the UI writes COMPLETE overrides.
                     // Based on my reading of `page.tsx`:
                     // updateTrackSetting adds fields. DELETE removes key. 
                     // So if key exists, we abide by it.
                 }
                 
                 // However, we also need to handle the case where trackSettings define access logic that overrides DEFAULT module logic.
                 // The `checkModuleAccess` function uses `module` object. We should construct an effective module object.
             }
          }

          // @ts-ignore
          const restrictedModules = enrollment.restrictedModules as string[] || [];

          const result = checkModuleAccess(effectiveModule, context, restrictedModules);

          return {
              user: {
                  id: user.id,
                  name: user.fullName || user.email,
                  email: user.email,
                  avatarUrl: user.avatarUrl,
                  track: user.track,
                  tariff: user.tariff,
                  groups: user.groupMembers.map(gm => gm.group.id), // For debugging/filtering
              },
              access: result
          };
      });

      return NextResponse.json<ApiResponse>(
        {
          success: true,
          data: accessResults,
        },
        { status: 200 }
      );

    } catch (error) {
      console.error("Content Access API Error:", error);
      return NextResponse.json<ApiResponse>(
        { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to fetch access data" } },
        { status: 500 }
      );
    }
  });
}
