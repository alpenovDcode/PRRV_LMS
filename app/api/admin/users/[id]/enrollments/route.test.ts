import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const ids = {
  admin: "00000000-0000-4000-8000-000000000001",
  user: "00000000-0000-4000-8000-000000000002",
  course: "00000000-0000-4000-8000-000000000003",
};

const { db, logAction } = vi.hoisted(() => ({
  db: {
    enrollment: {
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
  logAction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/audit", () => ({ logAction }));
vi.mock("@/lib/email-template-service", () => ({ sendTemplateEmail: vi.fn() }));
vi.mock("@/lib/api-middleware", () => ({
  withAuth: vi.fn(
    async (_request: NextRequest, handler: (request: NextRequest & { user: { userId: string } }) => Promise<Response>) =>
      handler(Object.assign(_request, { user: { userId: ids.admin } }))
  ),
}));

import { DELETE } from "./route";

function request() {
  return new NextRequest(
    `http://localhost/api/admin/users/${ids.user}/enrollments?courseId=${ids.course}`,
    { method: "DELETE" }
  );
}

describe("DELETE user enrollment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.enrollment.findUnique.mockResolvedValue({
      id: "enrollment-1",
      course: { title: "Менторство" },
    });
    db.enrollment.deleteMany.mockResolvedValue({ count: 1 });
  });

  it("reports that course access was removed", async () => {
    const response = await DELETE(request(), {
      params: Promise.resolve({ id: ids.user }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: { removed: true } });
  });

  it("is idempotent when the enrollment is already absent", async () => {
    db.enrollment.findUnique.mockResolvedValue(null);
    db.enrollment.deleteMany.mockResolvedValue({ count: 0 });

    const response = await DELETE(request(), {
      params: Promise.resolve({ id: ids.user }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: { removed: false } });
    expect(logAction).not.toHaveBeenCalled();
  });
});
