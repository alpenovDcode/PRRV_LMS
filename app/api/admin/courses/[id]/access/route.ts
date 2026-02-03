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

          // @ts-ignore
          const restrictedModules = enrollment.restrictedModules as string[] || [];
          // @ts-ignore
          const forcedModules = enrollment.forcedModules as string[] || [];

          const context: ModuleAccessContext = {
              userTariff: user.tariff,
              userTrack: user.track,
              userGroupIds,
              userGroupsMap,
              trackDefinitionCompletedAt,
              forcedModules
          };

          // Apply track specific logic if exists
          let effectiveModule = { ...module };
          if (user.track && module.trackSettings) {
             const settings = (module.trackSettings as Record<string, any>)[user.track];
             if (settings) {
                 if (settings.openAt) effectiveModule.openAt = settings.openAt;
                 if (settings.openAfterEvent) {
                     effectiveModule.openAfterEvent = settings.openAfterEvent;
                     effectiveModule.openAfterAmount = settings.openAfterAmount;
                     effectiveModule.openAfterUnit = settings.openAfterUnit;
                 }
             }
          }

          const result = checkModuleAccess(effectiveModule, context, restrictedModules);

          return {
              user: {
                  id: user.id,
                  name: user.fullName || user.email,
                  email: user.email,
                  avatarUrl: user.avatarUrl,
                  track: user.track,
                  tariff: user.tariff,
                  groups: user.groupMembers.map((gm: any) => gm.group.id), // For debugging/filtering
              },
              access: result,
              isRestricted: restrictedModules.includes(module.id),
              isForced: forcedModules.includes(module.id)
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req) => {
    try {
      const { id: courseId } = await params;
      const { userId, moduleId, action } = await request.json();

      if (!userId || !moduleId || !action) {
        return NextResponse.json<ApiResponse>(
            { success: false, error: { code: "MISSING_PARAM", message: "Missing required fields" } },
            { status: 400 }
        );
      }

      const enrollment = await db.enrollment.findUnique({
        where: {
            userId_courseId: {
                userId,
                courseId
            }
        }
      });

      if (!enrollment) {
        return NextResponse.json<ApiResponse>(
            { success: false, error: { code: "NOT_FOUND", message: "Enrollment not found" } },
            { status: 404 }
        );
      }

      // @ts-ignore
      let restrictedModules = (enrollment.restrictedModules as string[]) || [];
      // @ts-ignore
      let forcedModules = (enrollment.forcedModules as string[]) || [];

      if (action === "toggleRestricted") {
          if (restrictedModules.includes(moduleId)) {
              restrictedModules = restrictedModules.filter(id => id !== moduleId);
          } else {
              restrictedModules.push(moduleId);
              // If restricting, remove from forced to avoid conflict? 
              // Usually restriction blocks, forced forces. 
              // Forced should win in checkModuleAccess (-1 check).
              // But strictly speaking, if you force, you imply it's not restricted manually.
              // So let's clear forced if we restrict manually? 
              // Or keep them independent and let logic decide priority.
              // Logic says forced wins.
              // But if admin explicitly clicks "Restrict", they expect restriction.
              // So if restricting, remove from forced.
              forcedModules = forcedModules.filter(id => id !== moduleId);
          }
      } else if (action === "toggleForced") {
          if (forcedModules.includes(moduleId)) {
              forcedModules = forcedModules.filter(id => id !== moduleId);
          } else {
              forcedModules.push(moduleId);
              // If forcing, remove from restricted
              restrictedModules = restrictedModules.filter(id => id !== moduleId);
          }
      }

      await db.enrollment.update({
          where: { id: enrollment.id },
          data: {
              restrictedModules,
              forcedModules
          }
      });

      return NextResponse.json<ApiResponse>(
        { success: true },
        { status: 200 }
      );

    } catch (error) {
        console.error("Access Update Error:", error);
        return NextResponse.json<ApiResponse>(
            { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to update access" } },
            { status: 500 }
        );
    }
  });
}
