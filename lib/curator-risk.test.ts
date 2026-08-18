import { describe, expect, it } from "vitest";
import { calculateCuratorRisk } from "./curator-risk";

const now = new Date("2026-08-18T12:00:00.000Z");
const base = {
  now,
  enrolledAt: new Date("2026-08-01T12:00:00.000Z"),
  lastActiveAt: now,
  lastLearningActionAt: now,
  completedLessons: 8,
  totalLessons: 10,
  homeworkCount: 2,
  hasHomeworkLessons: true,
  certificationCompleted: true,
  hasCertification: true,
};

describe("calculateCuratorRisk", () => {
  it("keeps an active student green", () => {
    expect(calculateCuratorRisk(base).level).toBe("green");
  });

  it("marks a student with no actions as red and recommends contact", () => {
    const result = calculateCuratorRisk({
      ...base,
      enrolledAt: new Date("2026-08-01T12:00:00.000Z"),
      lastActiveAt: null,
      lastLearningActionAt: null,
      completedLessons: 0,
      homeworkCount: 0,
      certificationCompleted: false,
    });
    expect(result.level).toBe("red");
    expect(result.signals.map((signal) => signal.code)).toContain("never_started");
    expect(result.nextAction).toContain("Написать");
  });
});
