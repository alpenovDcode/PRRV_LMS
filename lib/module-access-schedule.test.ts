import { describe, expect, it } from "vitest";
import { resolveModuleAccess, shouldExposeModule, type ModuleAccessContext } from "./lms-logic";

const baseModule = {
  id: "module-1",
  title: "Модуль",
  allowedTariffs: [],
  allowedTracks: [],
  allowedGroups: [],
  openAt: null,
  openAfterAmount: null,
  openAfterUnit: null,
  openAfterEvent: null,
};

const context = (now: string): ModuleAccessContext => ({
  userTariff: null,
  userTrack: null,
  userGroupIds: ["group-late", "group-open"],
  userGroupsMap: new Map([
    ["group-late", new Date("2026-08-20T00:00:00.000Z")],
    ["group-open", new Date("2026-08-01T00:00:00.000Z")],
  ]),
  trackDefinitionCompletedAt: null,
  certificationCompletedAt: null,
  now: new Date(now),
});

describe("shouldExposeModule", () => {
  it("keeps modules that are waiting only for their opening time", () => {
    expect(
      shouldExposeModule({ isAccessible: false, reason: "time_locked", unlockDate: new Date() })
    ).toBe(true);
  });

  it.each(["tariff_mismatch", "track_mismatch", "group_mismatch", "restricted_manually"] as const)(
    "hides modules with %s",
    (reason) => {
      expect(shouldExposeModule({ isAccessible: false, reason, unlockDate: null })).toBe(false);
    }
  );
});

describe("resolveModuleAccess", () => {
  it("returns an exact future unlock date", () => {
    const result = resolveModuleAccess(
      { ...baseModule, openAt: "2026-08-19T10:00:00.000Z" },
      context("2026-08-18T10:00:00.000Z")
    );

    expect(result.access.isAccessible).toBe(false);
    expect(result.access.reason).toBe("time_locked");
    expect(result.access.unlockDate?.toISOString()).toBe("2026-08-19T10:00:00.000Z");
  });

  it("allows access through any matching group override", () => {
    const result = resolveModuleAccess(
      {
        ...baseModule,
        groupSettings: {
          "group-late": {
            openAt: "2026-08-25T00:00:00.000Z",
          },
          "group-open": {
            openAt: "2026-08-10T00:00:00.000Z",
          },
        },
      },
      context("2026-08-18T10:00:00.000Z")
    );

    expect(result.access.isAccessible).toBe(true);
    expect(result.scheduleSource).toBe("group");
  });

  it("calculates opening relative to the matching group start", () => {
    const result = resolveModuleAccess(
      {
        ...baseModule,
        allowedGroups: ["group-late"],
        openAfterEvent: "group_start_date",
        openAfterAmount: 2,
        openAfterUnit: "days",
      },
      context("2026-08-18T10:00:00.000Z")
    );

    expect(result.access.isAccessible).toBe(false);
    expect(result.access.unlockDate?.toISOString()).toBe("2026-08-22T00:00:00.000Z");
  });
});
