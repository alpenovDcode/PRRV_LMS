import { describe, expect, it } from "vitest";
import { renderTemplate, type RenderContext } from "../vars";

const ctx: RenderContext = {
  subscriber: {
    chatId: "12345",
    firstName: "Иван",
    lastName: "Иванов",
    username: "ivanov",
    variables: { city: "Москва", score: 42 },
  },
  bot: { username: "demo_bot", title: "Demo" },
  runContext: { http: { status: "ok" } },
};

describe("tg/vars", () => {
  it("substitutes user.first_name", () => {
    expect(renderTemplate("Привет, {{user.first_name}}!", ctx)).toBe("Привет, Иван!");
  });

  it("substitutes vars.<key>", () => {
    expect(renderTemplate("Город: {{vars.city}}, баллы: {{vars.score}}", ctx)).toBe(
      "Город: Москва, баллы: 42"
    );
  });

  it("nested ctx path works", () => {
    expect(renderTemplate("HTTP: {{ctx.http.status}}", ctx)).toBe("HTTP: ok");
  });

  it("unknown placeholder renders empty", () => {
    expect(renderTemplate("X{{vars.missing}}Y", ctx)).toBe("XY");
  });

  it("ignores non-placeholder braces", () => {
    expect(renderTemplate("{this is fine}", ctx)).toBe("{this is fine}");
  });
});
