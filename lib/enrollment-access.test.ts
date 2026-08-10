import { describe, expect, it } from "vitest";
import { normalizeEnrollmentAccess } from "./enrollment-access";

describe("normalizeEnrollmentAccess", () => {
  it("removes restricted modules from forced access", () => {
    expect(
      normalizeEnrollmentAccess({
        restrictedModules: ["module-a"],
        restrictedLessons: [],
        forcedModules: ["module-a", "module-b"],
      })
    ).toEqual({
      restrictedModules: ["module-a"],
      restrictedLessons: [],
      forcedModules: ["module-b"],
    });
  });

  it("deduplicates all access lists without changing their order", () => {
    expect(
      normalizeEnrollmentAccess({
        restrictedModules: ["module-a", "module-a"],
        restrictedLessons: ["lesson-a", "lesson-a", "lesson-b"],
        forcedModules: ["module-b", "module-b"],
      })
    ).toEqual({
      restrictedModules: ["module-a"],
      restrictedLessons: ["lesson-a", "lesson-b"],
      forcedModules: ["module-b"],
    });
  });
});
