import { describe, expect, it } from "vitest";
import {
  CERTIFICATION_LIMITS,
  shouldShowCharacterCount,
  validateCertificationAnswer,
  validateNumericAnswer,
} from "@/lib/certification-form-validation";

describe("validateNumericAnswer", () => {
  it.each(["0", "1300", "1 300", "1,300", "1\u00a0300", "1\u202f300"])(
    "accepts one whole number written as %s",
    (value) => {
      expect(validateNumericAnswer(value, "single_integer")).toBeUndefined();
    }
  );

  it.each(["1000-1300", "1000–1300", "1000—1300", "1,000–1 300"])(
    "accepts a valid range written as %s",
    (value) => {
      expect(validateNumericAnswer(value, "integer_or_range")).toBeUndefined();
    }
  );

  it.each(["1000-1300", "1,000–1 300"])("rejects a range in a single-number field: %s", (value) => {
    expect(validateNumericAnswer(value, "single_integer")).toBe(
      "Укажите одно целое число, например 20000"
    );
  });

  it.each(["-1", "12.5", "1,5", "12abc", "1 30", "1,", "–1000", "1000–", "1–2–3"])(
    "rejects malformed numeric input: %s",
    (value) => {
      expect(validateNumericAnswer(value, "integer_or_range")).toBe(
        "Можно указать одно целое число или диапазон, например 1000–1300"
      );
    }
  );

  it("rejects a reversed range", () => {
    expect(validateNumericAnswer("1300–1000", "integer_or_range")).toBe(
      "Начало диапазона не может быть больше конца"
    );
  });

  it("reports the numeric character limit before format errors", () => {
    const value = "1".repeat(CERTIFICATION_LIMITS.numeric + 1);

    expect(validateNumericAnswer(value, "single_integer")).toBe(
      "Слишком длинный ответ: максимум 40 символов"
    );
  });
});

describe("validateCertificationAnswer", () => {
  it.each([undefined, "", "   ", []])("rejects an unanswered required value: %j", (value) => {
    expect(validateCertificationAnswer({ value, required: true, kind: "text" })).toBe(
      "Это обязательный вопрос"
    );
  });

  it.each([undefined, "", "   ", []])("accepts an unanswered optional value: %j", (value) => {
    expect(validateCertificationAnswer({ value, required: false, kind: "text" })).toBeUndefined();
  });

  it("enforces the short-text limit without rejecting the boundary", () => {
    expect(
      validateCertificationAnswer({
        value: "а".repeat(CERTIFICATION_LIMITS.text),
        required: true,
        kind: "text",
      })
    ).toBeUndefined();
    expect(
      validateCertificationAnswer({
        value: "а".repeat(CERTIFICATION_LIMITS.text + 1),
        required: true,
        kind: "text",
      })
    ).toBe("Слишком длинный ответ: максимум 200 символов");
  });

  it("enforces the textarea limit without rejecting the boundary", () => {
    expect(
      validateCertificationAnswer({
        value: "а".repeat(CERTIFICATION_LIMITS.textarea),
        required: true,
        kind: "textarea",
      })
    ).toBeUndefined();
    expect(
      validateCertificationAnswer({
        value: "а".repeat(CERTIFICATION_LIMITS.textarea + 1),
        required: true,
        kind: "textarea",
      })
    ).toBe("Слишком длинный ответ: максимум 4000 символов");
  });

  it("uses the assigned numeric rule", () => {
    expect(
      validateCertificationAnswer({
        value: "1000–1300",
        required: true,
        kind: "numeric",
        numericRule: "single_integer",
      })
    ).toBe("Укажите одно целое число, например 20000");
    expect(
      validateCertificationAnswer({
        value: "1000–1300",
        required: true,
        kind: "numeric",
        numericRule: "integer_or_range",
      })
    ).toBeUndefined();
  });
});

describe("shouldShowCharacterCount", () => {
  it("shows the counter from 80 percent of the limit", () => {
    expect(shouldShowCharacterCount(159, 200)).toBe(false);
    expect(shouldShowCharacterCount(160, 200)).toBe(true);
    expect(shouldShowCharacterCount(201, 200)).toBe(true);
  });
});
