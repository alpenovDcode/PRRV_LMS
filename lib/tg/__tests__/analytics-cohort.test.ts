import { describe, expect, it } from "vitest";
import {
  isoWeekStartUTC,
  weekIndex,
  lastNIsoWeeks,
  buildRetentionGrid,
} from "../analytics/cohort";

describe("analytics/cohort", () => {
  it("floors a date to ISO Monday in UTC", () => {
    // 2025-05-14 is a Wednesday → Monday is 2025-05-12.
    const w = isoWeekStartUTC(new Date("2025-05-14T15:30:00Z"));
    expect(w.toISOString()).toBe("2025-05-12T00:00:00.000Z");
  });

  it("returns same Monday when input is already Monday 00:00 UTC", () => {
    const w = isoWeekStartUTC(new Date("2025-05-12T00:00:00Z"));
    expect(w.toISOString()).toBe("2025-05-12T00:00:00.000Z");
  });

  it("rolls Sunday back to the previous Monday (ISO week behavior)", () => {
    // 2025-05-18 is a Sunday → ISO Monday is 2025-05-12.
    const w = isoWeekStartUTC(new Date("2025-05-18T23:59:59Z"));
    expect(w.toISOString()).toBe("2025-05-12T00:00:00.000Z");
  });

  it("computes weekIndex relative to a cohort start", () => {
    const start = new Date("2025-05-12T00:00:00Z");
    expect(weekIndex(start, new Date("2025-05-12T00:00:00Z"))).toBe(0);
    expect(weekIndex(start, new Date("2025-05-18T23:59:59Z"))).toBe(0);
    expect(weekIndex(start, new Date("2025-05-19T00:00:00Z"))).toBe(1);
    expect(weekIndex(start, new Date("2025-06-02T00:00:00Z"))).toBe(3);
  });

  it("lastNIsoWeeks returns N weeks oldest-first ending at given week", () => {
    const ending = new Date("2025-05-12T00:00:00Z");
    const arr = lastNIsoWeeks(ending, 3);
    expect(arr.length).toBe(3);
    expect(arr[0].toISOString()).toBe("2025-04-28T00:00:00.000Z");
    expect(arr[1].toISOString()).toBe("2025-05-05T00:00:00.000Z");
    expect(arr[2].toISOString()).toBe("2025-05-12T00:00:00.000Z");
  });

  it("buildRetentionGrid computes percentages and nulls future weeks", () => {
    const cohortStart = new Date("2025-05-05T00:00:00Z");
    const members = new Map<string, Set<string>>([
      [cohortStart.toISOString(), new Set(["s1", "s2", "s3", "s4"])],
    ]);
    const events = [
      // week 0: s1, s2 active
      { subscriberId: "s1", occurredAt: new Date("2025-05-06T00:00:00Z") },
      { subscriberId: "s2", occurredAt: new Date("2025-05-07T00:00:00Z") },
      // week 1: only s1
      { subscriberId: "s1", occurredAt: new Date("2025-05-13T00:00:00Z") },
    ];
    const grid = buildRetentionGrid({
      now: new Date("2025-05-13T12:00:00Z"),
      cohorts: [cohortStart],
      members,
      events,
      maxWeeks: 4,
    });
    expect(grid).toHaveLength(1);
    expect(grid[0].size).toBe(4);
    // week 0 → 2/4 = 50%
    expect(grid[0].weeks[0]).toBe(50);
    // week 1 → 1/4 = 25%
    expect(grid[0].weeks[1]).toBe(25);
    // weeks 2 and 3 start in the future relative to `now`
    expect(grid[0].weeks[2]).toBeNull();
    expect(grid[0].weeks[3]).toBeNull();
  });

  it("buildRetentionGrid handles empty cohorts gracefully", () => {
    const cohortStart = new Date("2025-05-05T00:00:00Z");
    const grid = buildRetentionGrid({
      now: new Date("2025-05-20T00:00:00Z"),
      cohorts: [cohortStart],
      members: new Map(),
      events: [],
      maxWeeks: 3,
    });
    expect(grid[0].size).toBe(0);
    expect(grid[0].weeks).toEqual([0, 0, 0]);
  });
});
