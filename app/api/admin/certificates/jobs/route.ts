import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";

export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      const jobs = await db.certificateIssuanceJob.findMany({
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      const [users, courses] = await Promise.all([
        db.user.findMany({
          where: { id: { in: [...new Set(jobs.map((job) => job.userId))] } },
          select: { id: true, fullName: true, email: true },
        }),
        db.course.findMany({
          where: { id: { in: [...new Set(jobs.map((job) => job.courseId))] } },
          select: { id: true, title: true },
        }),
      ]);
      const usersById = new Map(users.map((user) => [user.id, user]));
      const coursesById = new Map(courses.map((course) => [course.id, course]));
      return NextResponse.json<ApiResponse>({
        success: true,
        data: jobs.map((job) => ({
          ...job,
          user: usersById.get(job.userId) ?? null,
          course: coursesById.get(job.courseId) ?? null,
        })),
      });
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}

const retrySchema = z.object({ jobId: z.string().uuid() });

export async function PATCH(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      try {
        const { jobId } = retrySchema.parse(await request.json());
        const result = await db.certificateIssuanceJob.updateMany({
          where: { id: jobId, status: { in: ["failed", "cancelled"] } },
          data: {
            status: "pending",
            attempts: 0,
            nextAttemptAt: new Date(),
            lockedAt: null,
            lastError: null,
          },
        });
        if (result.count === 0) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: { code: "NOT_RETRYABLE", message: "Задачу нельзя перезапустить" },
            },
            { status: 409 }
          );
        }
        return NextResponse.json<ApiResponse>({ success: true, data: { retried: true } });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return NextResponse.json<ApiResponse>(
            { success: false, error: { code: "VALIDATION_ERROR", message: "Некорректная задача" } },
            { status: 400 }
          );
        }
        throw error;
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
