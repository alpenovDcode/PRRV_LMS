import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";

type ScheduleSettings = {
  openAt?: string | null;
  openAfterEvent?: string | null;
  openAfterAmount?: number | null;
  openAfterUnit?: string | null;
};

function addDelay(date: Date, amount: number | null, unit: string | null) {
  if (amount === null || !unit) return date;
  if (unit === "days") date.setDate(date.getDate() + amount);
  if (unit === "weeks") date.setDate(date.getDate() + amount * 7);
  if (unit === "months") date.setMonth(date.getMonth() + amount);
  return date;
}

function applyOverride(base: ScheduleSettings, override?: ScheduleSettings): ScheduleSettings {
  if (!override) return base;
  if (override.openAt) {
    return {
      openAt: override.openAt,
      openAfterEvent: null,
      openAfterAmount: null,
      openAfterUnit: null,
    };
  }
  if (override.openAfterEvent) {
    return {
      openAt: null,
      openAfterEvent: override.openAfterEvent,
      openAfterAmount: override.openAfterAmount ?? null,
      openAfterUnit: override.openAfterUnit ?? null,
    };
  }
  return base;
}

export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      try {
        const [modules, groups] = await Promise.all([
          db.module.findMany({
            include: { course: { select: { title: true } } },
            orderBy: { courseId: "asc" },
          }),
          db.group.findMany({
            select: { id: true, name: true, courseId: true, startDate: true },
          }),
        ]);

        const now = new Date();
        const scheduleItems = [];

        for (const courseModule of modules) {
          const groupSettings = (courseModule.groupSettings ?? {}) as Record<
            string,
            ScheduleSettings
          >;
          const trackSettings = (courseModule.trackSettings ?? {}) as Record<
            string,
            ScheduleSettings
          >;
          const hasSchedule =
            Boolean(courseModule.openAt || courseModule.openAfterEvent) ||
            Object.values(groupSettings).some((value) => value.openAt || value.openAfterEvent) ||
            Object.values(trackSettings).some((value) => value.openAt || value.openAfterEvent);
          if (!hasSchedule) continue;

          const groupIds = new Set([...courseModule.allowedGroups, ...Object.keys(groupSettings)]);
          const pertinentGroups = groups.filter(
            (group) =>
              groupIds.has(group.id) ||
              (courseModule.allowedGroups.length === 0 && group.courseId === courseModule.courseId)
          );

          for (const group of pertinentGroups) {
            const schedule = applyOverride(
              {
                openAt: courseModule.openAt?.toISOString() ?? null,
                openAfterEvent: courseModule.openAfterEvent,
                openAfterAmount: courseModule.openAfterAmount,
                openAfterUnit: courseModule.openAfterUnit,
              },
              groupSettings[group.id]
            );

            let expectedOpenDate: Date | null = null;
            let status: "opened" | "waiting" | "event_waiting" | "error_no_date";
            let scheduleDescription: string | null = null;

            if (schedule.openAt) {
              expectedOpenDate = new Date(schedule.openAt);
              status = now >= expectedOpenDate ? "opened" : "waiting";
            } else if (schedule.openAfterEvent === "group_start_date") {
              if (!group.startDate) {
                status = "error_no_date";
              } else {
                expectedOpenDate = addDelay(
                  new Date(group.startDate),
                  schedule.openAfterAmount ?? null,
                  schedule.openAfterUnit ?? null
                );
                status = now >= expectedOpenDate ? "opened" : "waiting";
              }
            } else {
              status = "event_waiting";
              scheduleDescription =
                !schedule.openAfterEvent && Object.keys(trackSettings).length > 0
                  ? "Дата зависит от трека студента"
                  : schedule.openAfterEvent === "certification_completed"
                    ? "После прохождения сертификации студентом"
                    : schedule.openAfterEvent === "track_definition_completed"
                      ? "После определения трека студентом"
                      : "По индивидуальному событию студента";
            }

            scheduleItems.push({
              moduleId: courseModule.id,
              moduleTitle: courseModule.title,
              courseTitle: courseModule.course.title,
              groupId: group.id,
              groupName: group.name,
              expectedOpenDate: expectedOpenDate?.toISOString() ?? null,
              status,
              scheduleDescription,
              scheduleSource: groupSettings[group.id] ? "group" : "default",
            });
          }
        }

        scheduleItems.sort((a, b) => {
          if (!a.expectedOpenDate) return 1;
          if (!b.expectedOpenDate) return -1;
          return a.expectedOpenDate.localeCompare(b.expectedOpenDate);
        });

        return NextResponse.json<ApiResponse>({ success: true, data: scheduleItems });
      } catch (error) {
        console.error("Failed to fetch schedule:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: { code: "INTERNAL_ERROR", message: "Не удалось загрузить расписание" },
          },
          { status: 500 }
        );
      }
    },
    { roles: ["admin", "curator"] }
  );
}
