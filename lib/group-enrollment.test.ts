import { describe, expect, it } from "vitest";
import { moveEnrollmentToGroupStart } from "./group-enrollment";

describe("moveEnrollmentToGroupStart", () => {
  it("moves both dates while preserving the access duration", () => {
    const result = moveEnrollmentToGroupStart(
      {
        startDate: new Date("2026-07-01T00:00:00.000Z"),
        expiresAt: new Date("2026-10-01T00:00:00.000Z"),
      },
      new Date("2026-08-01T00:00:00.000Z")
    );

    expect(result.startDate.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(result.expiresAt?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("keeps perpetual access perpetual", () => {
    const result = moveEnrollmentToGroupStart(
      { startDate: new Date("2026-07-01T00:00:00.000Z"), expiresAt: null },
      new Date("2026-08-01T00:00:00.000Z")
    );

    expect(result.startDate.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(result.expiresAt).toBeNull();
  });

  it("does not alter dates when the target group has no start date", () => {
    const enrollment = {
      startDate: new Date("2026-07-01T00:00:00.000Z"),
      expiresAt: new Date("2026-10-01T00:00:00.000Z"),
    };

    expect(moveEnrollmentToGroupStart(enrollment, null)).toEqual(enrollment);
  });
});
