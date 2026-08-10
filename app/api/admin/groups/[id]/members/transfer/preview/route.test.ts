import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { adminGroupTransferSchema } from "@/lib/validations";

const ids = {
  admin: "00000000-0000-4000-8000-000000000001",
  user: "00000000-0000-4000-8000-000000000002",
  sourceGroup: "00000000-0000-4000-8000-000000000003",
  targetGroup: "00000000-0000-4000-8000-000000000004",
  sourceCourse: "00000000-0000-4000-8000-000000000005",
  targetCourse: "00000000-0000-4000-8000-000000000006",
  sourceModule: "00000000-0000-4000-8000-000000000007",
  targetModule: "00000000-0000-4000-8000-000000000008",
  sourceLesson: "00000000-0000-4000-8000-000000000009",
  targetLesson: "00000000-0000-4000-8000-000000000010",
};

const { db } = vi.hoisted(() => ({
  db: {
    groupMember: { findUnique: vi.fn() },
    group: { findUnique: vi.fn() },
    lesson: { findMany: vi.fn() },
    lessonProgress: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/api-middleware", () => ({
  withAuth: vi.fn(
    async (_request: NextRequest, handler: (request: NextRequest) => Promise<Response>) =>
      handler(Object.assign(_request, { user: { userId: ids.admin } }))
  ),
}));

import { POST } from "./route";

function request() {
  return new NextRequest(
    `http://localhost/api/admin/groups/${ids.sourceGroup}/members/transfer/preview`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: ids.user, targetGroupId: ids.targetGroup }),
    }
  );
}

describe("adminGroupTransferSchema", () => {
  it("keeps the legacy transfer payload valid", () => {
    expect(
      adminGroupTransferSchema.parse({ userId: ids.user, targetGroupId: ids.targetGroup })
    ).toEqual({ userId: ids.user, targetGroupId: ids.targetGroup });
  });

  it("accepts explicit revocation and progress mappings", () => {
    expect(
      adminGroupTransferSchema.parse({
        userId: ids.user,
        targetGroupId: ids.targetGroup,
        revokeSourceEnrollment: true,
        progressMappings: [
          { sourceLessonId: ids.sourceLesson, targetLessonId: ids.targetLesson },
        ],
      })
    ).toMatchObject({
      revokeSourceEnrollment: true,
      progressMappings: [
        { sourceLessonId: ids.sourceLesson, targetLessonId: ids.targetLesson },
      ],
    });
  });
});

describe("POST transfer preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.groupMember.findUnique.mockResolvedValue({
      userId: ids.user,
      group: {
        id: ids.sourceGroup,
        name: "Поток 75",
        courseId: ids.sourceCourse,
        course: { id: ids.sourceCourse, title: "Менторство" },
      },
    });
    db.group.findUnique.mockResolvedValue({
      id: ids.targetGroup,
      name: "Поток 82",
      courseId: ids.targetCourse,
      course: { id: ids.targetCourse, title: "Прорыв NEW" },
    });
    db.lesson.findMany
      .mockResolvedValueOnce([
        {
          id: ids.sourceLesson,
          title: "Старт",
          type: "video",
          orderIndex: 0,
          module: {
            id: ids.sourceModule,
            title: "Введение",
            orderIndex: 0,
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: ids.targetLesson,
          title: "Старт",
          type: "video",
          orderIndex: 0,
          module: {
            id: ids.targetModule,
            title: "Введение",
            orderIndex: 0,
          },
        },
      ]);
    db.lessonProgress.findMany
      .mockResolvedValueOnce([
        {
          lessonId: ids.sourceLesson,
          status: "completed",
          watchedTime: 120,
          completedAt: new Date("2026-08-01T10:00:00.000Z"),
        },
      ])
      .mockResolvedValueOnce([]);
  });

  it("returns source and target lessons with safe suggestions", async () => {
    const response = await POST(request(), {
      params: Promise.resolve({ id: ids.sourceGroup }),
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.sourceCourse).toEqual({ id: ids.sourceCourse, title: "Менторство" });
    expect(json.data.targetCourse).toEqual({ id: ids.targetCourse, title: "Прорыв NEW" });
    expect(json.data.suggestions).toEqual([
      {
        sourceLessonId: ids.sourceLesson,
        targetLessonId: ids.targetLesson,
        confidence: "exact",
        selected: true,
      },
    ]);
    expect(json.data.sourceLessons[0]).toMatchObject({
      id: ids.sourceLesson,
      progress: { status: "completed", watchedTime: 120 },
    });
  });

  it("rejects a preview for a user outside the source group", async () => {
    db.groupMember.findUnique.mockResolvedValue(null);

    const response = await POST(request(), {
      params: Promise.resolve({ id: ids.sourceGroup }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: "NOT_FOUND", message: "Участник не найден в исходной группе" },
    });
    expect(db.lesson.findMany).not.toHaveBeenCalled();
  });
});
