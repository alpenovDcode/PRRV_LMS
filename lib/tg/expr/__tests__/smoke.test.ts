// Smoke tests for the expression engine. Run with `npx vitest run lib/tg/expr`.

import { describe, it, expect } from "vitest";
import { renderTemplate, evalCondition, evalExpression } from "..";
import type { EvalContext } from "../evaluator";

function ctx(overrides: Record<string, unknown> = {}): EvalContext {
  const data: Record<string, unknown> = {
    name: "Иван",
    first_name: "Иван",
    last_name: "Петров",
    full_name: "Иван Петров",
    age: 25,
    progress: 0.75,
    tags: ["vip", "paid"],
    client: { score: 100, email: "a@b.com" },
    project: { brand: "Acme" },
    const: { tax: 0.2 },
    current_date: "13.05.2026",
    current_time: "10:30",
    next_day: "14.05.2026",
    weekday: 3,
    today: "13.05.2026",
    now: "13.05.2026",
    question: "Привет, бот",
    none: "",
    ...overrides,
  };
  return { resolve: (n) => data[n] };
}

describe("renderTemplate — basics", () => {
  it("substitutes simple identifier", () => {
    expect(renderTemplate("Hi {{name}}!", ctx())).toBe("Hi Иван!");
  });
  it("supports both {{ }} and #{ }", () => {
    expect(renderTemplate("a #{name} b {{name}}", ctx())).toBe("a Иван b Иван");
  });
  it("renders missing var as empty string", () => {
    expect(renderTemplate("a {{nope}} b", ctx())).toBe("a  b");
  });
  it("does not throw on broken expression", () => {
    expect(renderTemplate("a {{(}} b", ctx())).toBe("a  b");
  });
  it("resolves nested member access", () => {
    expect(renderTemplate("score={{client.score}}", ctx())).toBe("score=100");
  });
  it("supports inline arithmetic", () => {
    expect(renderTemplate("{{age + 5}}", ctx())).toBe("30");
  });
  it("string concat with +", () => {
    expect(renderTemplate("{{first_name + ' ' + last_name}}", ctx())).toBe("Иван Петров");
  });
});

describe("date helpers", () => {
  it("addDays() adds and respects negatives", () => {
    expect(renderTemplate("{{addDays('01.05.2026', 3)}}", ctx())).toBe("04.05.2026");
    expect(renderTemplate("{{addDays('01.05.2026', -1)}}", ctx())).toBe("30.04.2026");
  });
  it("date + days direct math", () => {
    // need numeric literal on right
    expect(renderTemplate("{{'01.05.2026' + 7}}", ctx())).toBe("08.05.2026");
  });
  it("date - date returns days", () => {
    expect(renderTemplate("{{'15.05.2026' - '10.05.2026'}}", ctx())).toBe("5");
  });
  it("time + minutes direct math", () => {
    expect(renderTemplate("{{'10:00' + 90}}", ctx())).toBe("11:30");
  });
  it("addMonth handles negative", () => {
    expect(renderTemplate("{{addMonth('01.05.2026', -2)}}", ctx())).toBe("01.03.2026");
  });
  it("date_rus formats correctly", () => {
    expect(renderTemplate("{{date_rus('13.05.2026')}}", ctx())).toBe("13 мая");
  });
});

describe("string helpers", () => {
  it("substring with negative end", () => {
    expect(renderTemplate("{{substring('тестовая строка', 0, -7)}}", ctx())).toBe("тестовая");
  });
  it("normalizePhone normalises 8→7", () => {
    expect(renderTemplate("{{normalizePhone('+7 (978) 111-22-33')}}", ctx())).toBe("79781112233");
    expect(renderTemplate("{{normalizePhone('8 978 1112233')}}", ctx())).toBe("79781112233");
  });
  it("contains case-insensitive", () => {
    expect(renderTemplate("{{contains('Hello World', 'WORLD', false)}}", ctx())).toBe("true");
  });
  it("tg_escape escapes MarkdownV2 specials", () => {
    expect(renderTemplate("{{tg_escape('a.b_c')}}", ctx())).toBe("a\\.b\\_c");
  });
});

describe("regex helpers", () => {
  it("findall returns nth match", () => {
    expect(renderTemplate("{{findall('\\\\d+', 'a 12 b 34', 1)}}", ctx())).toBe("34");
  });
  it("similar finds fuzzy match", () => {
    expect(evalExpression("similar('Привет', 'превет')", ctx())).toBe(true);
    expect(evalExpression("similar('Привет', 'пока')", ctx())).toBe(false);
  });
});

describe("conditions", () => {
  it("numeric comparisons", () => {
    expect(evalCondition("age >= 18 and age < 65", ctx())).toBe(true);
    expect(evalCondition("age > 30", ctx())).toBe(false);
  });
  it("tag check via in_array", () => {
    expect(evalCondition("in_array(tags, 'vip')", ctx())).toBe(true);
    expect(evalCondition("in_array(tags, 'unknown')", ctx())).toBe(false);
  });
  it("string equality", () => {
    expect(evalCondition("name == 'Иван'", ctx())).toBe(true);
    expect(evalCondition("name == 'Петя'", ctx())).toBe(false);
  });
  it("logical chains short-circuit", () => {
    expect(evalCondition("name == 'Иван' or 1/0", ctx())).toBe(true);
  });
  it("not operator", () => {
    expect(evalCondition("not (age < 18)", ctx())).toBe(true);
  });
  it("compound numeric+string", () => {
    expect(evalCondition("age >= 18 and country == 'RU'", ctx({ country: "RU" }))).toBe(true);
    expect(evalCondition("age >= 18 and country == 'RU'", ctx({ country: "US" }))).toBe(false);
  });
  it("missing var compares as undefined", () => {
    expect(evalCondition("missing == 5", ctx())).toBe(false);
  });
});

describe("calculator-style scopes", () => {
  it("reads client.x and project.x and const.x", () => {
    expect(renderTemplate("{{client.score}}-{{project.brand}}-{{const.tax}}", ctx())).toBe(
      "100-Acme-0.2"
    );
  });
});

describe("safety", () => {
  it("rejects method calls", () => {
    // `(1+1).toString()` would be a member-call — banned by design
    expect(() => evalExpression("(1).constructor", ctx())).not.toThrow();
    expect(() => evalExpression("(1).constructor('alert(1)')", ctx())).toThrow();
  });
  it("rejects unknown function", () => {
    expect(() => evalExpression("eval('1')", ctx())).toThrow(/unknown function 'eval'/);
  });
  it("doesn't crash on division by zero", () => {
    expect(evalExpression("10/0", ctx())).toBe(0);
  });
});
