import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const ids = {
  admin: "00000000-0000-4000-8000-000000000001",
  user: "00000000-0000-4000-8000-000000000002",
  sourceGroup: "00000000-0000-4000-8000-000000000003",
  targetGroup: "00000000-0000-4000-8000-000000000004",
  sourceCourse: "00000000-0000-4000-8000-000000000005",
  targetCourse: "00000000-0000-4000-8000-000000000006",
  sourceLesson: "00000000-0000-4000-8000-000000000007",
  targetLesson: "00000000-0000-4000-8000-000000000008",
};

const { db, tx, logAction, createNotification } = vi.hoisted(() => {
  const tx = {
    groupMember: { create: vi.fn(), delete: vi.fn() },
    enrollment: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    lesson: { findMany: vi.fn() },
    lessonProgress: { findMany: vi.fn(), upsert: vi.fn() },
  };
  return {
    tx,
    db: {
      groupMember: { findUnique: vi.fn() },
      group: { findUnique: vi.fn() },
      $transaction: vi.fn(),
    },
    logAction: vi.fn(),
    createNotification: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/audit", () => ({ logAction }));
vi.mock("@/lib/notifications", () => ({ createNotification }));
vi.mock("@/lib/api-middleware", () => ({
  withAuth: vi.fn(
    async (_request: NextRequest, handler: (request: NextRequest & { user: { userId: string } }) => Promise<Response>) =>
      handler(Object.assign(_request, { user: { userId: ids.admin } }))
  ),
}));

import { POST } from "./route";

function request(body: Record<string, unknown>) {
  return new NextRequest(
    `http://localhost/api/admin/groups/${ids.sourceGroup}/members/transfer`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: ids.user, targetGroupId: ids.targetGroup, ...body }),
    }
  );
}

describe("POST group member transfer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.groupMember.findUnique
      .mockResolvedValueOnce({
        userId: ids.user,
        group: {
          id: ids.sourceGroup,
          name: "Поток 75",
          courseId: ids.sourceCourse,
        },
        user: { email: "student@example.com" },
      })
      .mockResolvedValueOnce(null);
    db.group.findUnique.mockResolvedValue({
      id: ids.targetGroup,
      name: "Поток 82",
      courseId: ids.targetCourse,
      startDate: new Date("2026-08-01T00:00:00.000Z"),
    });
    db.$transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
      callback(tx)
    );
    tx.enrollment.findUnique.mockResolvedValue(null);
    tx.enrollment.create.mockResolvedValue({ id: "target-enrollment" });
    tx.enrollment.deleteMany.mockResolvedValue({ count: 1 });
    tx.lesson.findMany
      .mockResolvedValueOnce([{ id: ids.sourceLesson }])
      .mockResolvedValueOnce([{ id: ids.targetLesson }]);
    tx.lessonProgress.findMany
      .mockResolvedValueOnce([
        {
          lessonId: ids.sourceLesson,
          status: "completed",
          watchedTime: 120,
          completedAt: new Date("2026-07-20T10:00:00.000Z"),
        },
      ])
      .mockResolvedValueOnce([]);
    tx.lessonProgress.upsert.mockResolvedValue({ lessonId: ids.targetLesson });
  });

  it("copies confirmed progress and revokes the old course in one transaction", async () => {
    const response = await POST(
      request({
        revokeSourceEnrollment: true,
        progressMappings: [
          { sourceLessonId: ids.sourceLesson, targetLessonId: ids.targetLesson },
        ],
      }),
      { params: Promise.resolve({ id: ids.sourceGroup }) }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      data: {
        historyPreserved: true,
        sourceEnrollmentRevoked: true,
        transferredLessons: 1,
        skippedLessons: 0,
      },
    });
    expect(tx.lessonProgress.upsert).toHaveBeenCalledWith({
      where: { userId_lessonId: { userId: ids.user, lessonId: ids.targetLesson } },
      update: expect.objectContaining({ status: "completed", watchedTime: 120 }),
      create: expect.objectContaining({
        userId: ids.user,
        lessonId: ids.targetLesson,
        status: "completed",
        watchedTime: 120,
      }),
    });
    expect(tx.enrollment.deleteMany).toHaveBeenCalledWith({
      where: { userId: ids.user, courseId: ids.sourceCourse },
    });
  });

  it("keeps legacy transfer behavior when new fields are omitted", async () => {
    const response = await POST(request({}), {
      params: Promise.resolve({ id: ids.sourceGroup }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        historyPreserved: true,
        sourceEnrollmentRevoked: false,
        transferredLessons: 0,
      },
    });
    expect(tx.lessonProgress.upsert).not.toHaveBeenCalled();
    expect(tx.enrollment.deleteMany).not.toHaveBeenCalled();
  });

  it("rejects mappings containing a lesson outside the selected course", async () => {
    tx.lesson.findMany.mockReset();
    tx.lesson.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: ids.targetLesson }]);

    const response = await POST(
      request({
        progressMappings: [
          { sourceLessonId: ids.sourceLesson, targetLessonId: ids.targetLesson },
        ],
      }),
      { params: Promise.resolve({ id: ids.sourceGroup }) }
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "INVALID_PROGRESS_MAPPING" },
    });
    expect(tx.lessonProgress.upsert).not.toHaveBeenCalled();
  });

  it("does not report success when progress persistence fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    tx.lessonProgress.upsert.mockRejectedValue(new Error("database unavailable"));

    const response = await POST(
      request({
        progressMappings: [
          { sourceLessonId: ids.sourceLesson, targetLessonId: ids.targetLesson },
        ],
      }),
      { params: Promise.resolve({ id: ids.sourceGroup }) }
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ success: false });
    expect(createNotification).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
