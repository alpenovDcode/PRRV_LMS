import { describe, expect, it } from "vitest";
import { getLearningUnlockDate } from "./learning-engagement";
import type { ModuleAccessContext } from "./lms-logic";

const context: ModuleAccessContext = {
  userTariff: "VR",
  userTrack: null,
  userGroupIds: ["group-1"],
  userGroupsMap: new Map([["group-1", new Date("2026-08-01T09:00:00.000Z")]]),
  trackDefinitionCompletedAt: null,
  certificationCompletedAt: new Date("2026-08-10T10:00:00.000Z"),
};

describe("getLearningUnlockDate", () => {
  it("calculates a group-relative opening date", () => {
    expect(
      getLearningUnlockDate(
        {
          openAt: null,
          openAfterEvent: "group_start_date",
          openAfterAmount: 2,
          openAfterUnit: "weeks",
        },
        context,
        "group-1"
      )?.toISOString()
    ).toBe("2026-08-15T09:00:00.000Z");
  });

  it("calculates an opening date after certification", () => {
    expect(
      getLearningUnlockDate(
        {
          openAt: null,
          openAfterEvent: "certification_completed",
          openAfterAmount: 3,
          openAfterUnit: "days",
        },
        context
      )?.toISOString()
    ).toBe("2026-08-13T10:00:00.000Z");
  });
});
