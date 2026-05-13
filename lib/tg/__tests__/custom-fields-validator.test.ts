// Validator covers the boring-but-critical type coercion that decides
// whether a wait_reply input gets accepted into the custom-fields bag.

import { describe, it, expect } from "vitest";
import { validateCustomFieldValue } from "../custom-fields-validator";

function f(overrides: Record<string, unknown> = {}) {
  return {
    type: "text",
    options: [],
    validationRegex: null,
    isRequired: false,
    label: "Поле",
    ...overrides,
  } as unknown as Parameters<typeof validateCustomFieldValue>[0];
}

describe("validateCustomFieldValue", () => {
  describe("empty/required", () => {
    it("optional empty → ok with null", () => {
      const r = validateCustomFieldValue(f({}), "");
      expect(r.ok).toBe(true);
      expect(r.value).toBeNull();
    });
    it("required empty → fail", () => {
      const r = validateCustomFieldValue(f({ isRequired: true }), "");
      expect(r.ok).toBe(false);
    });
  });

  describe("number", () => {
    it("accepts ints and floats", () => {
      expect(validateCustomFieldValue(f({ type: "number" }), "42")).toMatchObject({ ok: true, value: 42 });
      expect(validateCustomFieldValue(f({ type: "number" }), "3.14")).toMatchObject({ ok: true, value: 3.14 });
      expect(validateCustomFieldValue(f({ type: "number" }), "3,14")).toMatchObject({ ok: true, value: 3.14 });
    });
    it("rejects non-numeric", () => {
      expect(validateCustomFieldValue(f({ type: "number" }), "abc").ok).toBe(false);
    });
  });

  describe("email", () => {
    it("accepts valid email", () => {
      expect(validateCustomFieldValue(f({ type: "email" }), "test@example.com").ok).toBe(true);
    });
    it("rejects bad email", () => {
      expect(validateCustomFieldValue(f({ type: "email" }), "notanemail").ok).toBe(false);
    });
  });

  describe("phone", () => {
    it("normalises 8 → 7", () => {
      expect(
        validateCustomFieldValue(f({ type: "phone" }), "8 (999) 123-45-67"),
      ).toMatchObject({ ok: true, value: "79991234567" });
    });
    it("rejects too short", () => {
      expect(validateCustomFieldValue(f({ type: "phone" }), "123").ok).toBe(false);
    });
  });

  describe("date", () => {
    it("accepts dd.mm.yyyy", () => {
      expect(validateCustomFieldValue(f({ type: "date" }), "13.05.2026").ok).toBe(true);
    });
    it("accepts dd-mm-yyyy", () => {
      expect(validateCustomFieldValue(f({ type: "date" }), "13-05-2026").ok).toBe(true);
    });
    it("rejects bad format", () => {
      expect(validateCustomFieldValue(f({ type: "date" }), "2026-05-13").ok).toBe(false);
    });
  });

  describe("boolean", () => {
    it("accepts ru/en truthy", () => {
      expect(validateCustomFieldValue(f({ type: "boolean" }), "да")).toMatchObject({ ok: true, value: true });
      expect(validateCustomFieldValue(f({ type: "boolean" }), "yes")).toMatchObject({ ok: true, value: true });
      expect(validateCustomFieldValue(f({ type: "boolean" }), "false")).toMatchObject({ ok: true, value: false });
    });
    it("rejects garbage", () => {
      expect(validateCustomFieldValue(f({ type: "boolean" }), "maybe").ok).toBe(false);
    });
  });

  describe("select", () => {
    const sel = f({
      type: "select",
      options: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
    });
    it("accepts known value", () => {
      expect(validateCustomFieldValue(sel, "a").ok).toBe(true);
    });
    it("rejects unknown value", () => {
      expect(validateCustomFieldValue(sel, "c").ok).toBe(false);
    });
  });

  describe("url", () => {
    it("accepts https://", () => {
      expect(validateCustomFieldValue(f({ type: "url" }), "https://example.com").ok).toBe(true);
    });
    it("rejects www only", () => {
      expect(validateCustomFieldValue(f({ type: "url" }), "example.com").ok).toBe(false);
    });
  });

  describe("custom regex on top of type", () => {
    const corp = f({
      type: "email",
      validationRegex: "@corp\\.ru$",
    });
    it("accepts when both pass", () => {
      expect(validateCustomFieldValue(corp, "user@corp.ru").ok).toBe(true);
    });
    it("rejects when regex fails", () => {
      expect(validateCustomFieldValue(corp, "user@example.com").ok).toBe(false);
    });
  });
});
