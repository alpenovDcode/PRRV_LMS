import { describe, it, expect } from "vitest";
import { briefUpdateSchema, briefCaseUpdateSchema } from "@/lib/brief";

// Регресс на баг: Блок 6 брифа (визуальные предпочтения) и текстовые поля
// кейсов были ограничены max(2000), тогда как блоки 1/4/5 допускают 5000,
// а колонки в БД — @db.Text (без лимита). Студенты писали развёрнутые
// ответы (>2000) → PATCH /api/brief падал с сырым "String must contain at
// most 2000 characters", переход 6→7 блокировался, Блок 6 не сохранялся.
// Лимит выровнен до 5000.
describe("briefUpdateSchema — лимиты полей Блока 6", () => {
  const STYLE_FIELDS = [
    "existingStyle",
    "preferredStyle",
    "characterImage",
    "cardImpression",
    "colorPreferences",
  ] as const;

  for (const field of STYLE_FIELDS) {
    it(`принимает ${field} длиной 2500 символов (раньше падало на 2000)`, () => {
      const res = briefUpdateSchema.safeParse({ [field]: "я".repeat(2500) });
      expect(res.success).toBe(true);
    });

    it(`принимает ${field} длиной ровно 5000 символов`, () => {
      const res = briefUpdateSchema.safeParse({ [field]: "я".repeat(5000) });
      expect(res.success).toBe(true);
    });

    it(`отклоняет ${field} длиннее 5000 символов`, () => {
      const res = briefUpdateSchema.safeParse({ [field]: "я".repeat(5001) });
      expect(res.success).toBe(false);
    });
  }
});

describe("briefCaseUpdateSchema — лимиты текстовых полей кейса", () => {
  const CASE_TEXT_FIELDS = ["goal", "beforeText", "problems", "afterText"] as const;

  for (const field of CASE_TEXT_FIELDS) {
    it(`принимает ${field} длиной 2500 символов (раньше падало на 2000)`, () => {
      const res = briefCaseUpdateSchema.safeParse({ [field]: "я".repeat(2500) });
      expect(res.success).toBe(true);
    });
  }
});
