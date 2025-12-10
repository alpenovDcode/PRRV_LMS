import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkLessonAvailability, checkPrerequisites } from "./lms-logic";
import { subDays } from "date-fns";

const { db } = vi.hoisted(() => {
  return {
    db: {
      lesson: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
      },
      homeworkSubmission: {
        findFirst: vi.fn(),
      },
    },
  };
});

vi.mock("@/lib/db", () => ({
  db,
}));

describe("LMS Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("checkLessonAvailability", () => {
    it("should throw if lesson not found", async () => {
      db.lesson.findUnique.mockResolvedValue(null);
      await expect(checkLessonAvailability("user1", "lesson1")).rejects.toThrow("Lesson not found");
    });

    it("should return not_enrolled if no enrollment", async () => {
      db.lesson.findUnique.mockResolvedValue({
        module: { course: { enrollments: [] } },
      });
      const result = await checkLessonAvailability("user1", "lesson1");
      expect(result).toEqual({ isAvailable: false, reason: "not_enrolled" });
    });

    it("should return enrollment_expired if expired", async () => {
      db.lesson.findUnique.mockResolvedValue({
        module: {
          course: {
            enrollments: [{ status: "active", startDate: new Date(), expiresAt: subDays(new Date(), 1) }],
          },
        },
      });
      const result = await checkLessonAvailability("user1", "lesson1");
      expect(result).toEqual({ isAvailable: false, reason: "enrollment_expired" });
    });

    it("should return drip_locked if drip rule not met (after_start)", async () => {
      const startDate = new Date();
      db.lesson.findUnique.mockResolvedValue({
        dripRule: { type: "after_start", days: 5 },
        module: {
          course: {
            enrollments: [{ status: "active", startDate }],
          },
        },
      });
      const result = await checkLessonAvailability("user1", "lesson1");
      expect(result.isAvailable).toBe(false);
      expect(result.reason).toBe("drip_locked");
    });

    it("should return isAvailable true if drip rule met", async () => {
      const startDate = subDays(new Date(), 6); // Started 6 days ago
      db.lesson.findUnique.mockResolvedValue({
        dripRule: { type: "after_start", days: 5 },
        module: {
          course: {
            enrollments: [{ status: "active", startDate }],
          },
        },
      });
      const result = await checkLessonAvailability("user1", "lesson1");
      expect(result).toEqual({ isAvailable: true });
    });
  });

  describe("checkPrerequisites", () => {
    it("should return unlocked if no previous lesson", async () => {
      db.lesson.findUnique.mockResolvedValue({ id: "l2", moduleId: "m1", orderIndex: 2 });
      db.lesson.findFirst.mockResolvedValue(null);

      const result = await checkPrerequisites("user1", "l2");
      expect(result).toEqual({ isUnlocked: true });
    });

    it("should return locked if previous lesson is stop lesson and no homework", async () => {
      db.lesson.findUnique.mockResolvedValue({ id: "l2", moduleId: "m1", orderIndex: 2 });
      db.lesson.findFirst.mockResolvedValue({ id: "l1", isStopLesson: true });
      db.homeworkSubmission.findFirst.mockResolvedValue(null);

      const result = await checkPrerequisites("user1", "l2");
      expect(result.isUnlocked).toBe(false);
      expect(result.reason).toBe("previous_homework_required");
    });

    it("should return unlocked if previous lesson is stop lesson and homework approved", async () => {
      db.lesson.findUnique.mockResolvedValue({ id: "l2", moduleId: "m1", orderIndex: 2 });
      db.lesson.findFirst.mockResolvedValue({ id: "l1", isStopLesson: true });
      db.homeworkSubmission.findFirst.mockResolvedValue({ status: "approved" });

      const result = await checkPrerequisites("user1", "l2");
      expect(result).toEqual({ isUnlocked: true });
    });
  });
});
