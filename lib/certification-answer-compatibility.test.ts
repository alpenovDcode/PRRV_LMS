import { describe, expect, it } from "vitest";
import {
  extractCertificationIncomePoints,
  formatCertificationAnswers,
  parseCertificationIncome,
} from "@/lib/certification-answer-compatibility";

describe("formatCertificationAnswers", () => {
  it("stores renamed questions under their stable historical keys", () => {
    expect(
      formatCertificationAnswers(
        [
          {
            id: "income",
            text: "Короткий текст",
            storageKey: "Исторический текст",
          },
          { id: "city", text: "Город" },
          { id: "skills", text: "Навыки" },
        ],
        {
          income: "20,000",
          city: "Алматы",
          skills: ["Продажи", "Маркетинг"],
        }
      )
    ).toEqual({
      "Исторический текст": "20,000",
      Город: "Алматы",
      Навыки: "Продажи, Маркетинг",
    });
  });

  it("omits unanswered optional questions", () => {
    expect(
      formatCertificationAnswers(
        [
          { id: "city", text: "Город" },
          { id: "comment", text: "Комментарий" },
        ],
        { city: "Алматы" }
      )
    ).toEqual({ Город: "Алматы" });
  });
});

describe("parseCertificationIncome", () => {
  it.each([
    ["20000", 20000],
    ["20,000", 20000],
    ["20 000", 20000],
    ["20\u00a0000", 20000],
    ["20\u202f000", 20000],
    ["20 000 руб.", 20000],
  ])("parses %s as %d", (raw, expected) => {
    expect(parseCertificationIncome(raw)).toBe(expected);
  });

  it.each([undefined, null, "", "нет", "0"])("rejects non-positive or empty income: %s", (raw) => {
    expect(parseCertificationIncome(raw)).toBeNull();
  });
});

describe("extractCertificationIncomePoints", () => {
  it("extracts point A and B from the shortened question labels", () => {
    expect(
      extractCertificationIncomePoints({
        'Ваш доход в точке А? С каким уровнем дохода в месяц вы пришли на программу "Прорыв"?':
          "20,000",
        "Точка Б: Ваш доход за последний месяц в рублях?": "40 000",
      })
    ).toEqual({ pointA: 20000, pointB: 40000 });
  });

  it("extracts point A and B from the historical question labels", () => {
    expect(
      extractCertificationIncomePoints({
        'Ваш доход в точке А? С каким уровнем дохода в месяц вы пришли на программу "Прорыв"? Укажите цифрой, без запятых, пробелов и прочего (Пример: 20000)':
          "20000",
        "Точка Б: Ваш доход за последний месяц в рублях? Укажите цифрой, без запятых, пробелов и прочего (Пример: 100000)":
          "40000",
      })
    ).toEqual({ pointA: 20000, pointB: 40000 });
  });
});
