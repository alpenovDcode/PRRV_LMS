import { describe, expect, it } from "vitest";
import { renderTemplate, buildEvalContext } from "../vars";

// Build a context matching the new buildEvalContext API. The old
// flat-object shape was retired in Iter 1 when we introduced the
// 4-scope variable model.
function makeCtx(overrides: { variables?: Record<string, unknown>; runContext?: Record<string, unknown> } = {}) {
  return buildEvalContext({
    subscriber: {
      id: "sub-1",
      chatId: "12345",
      firstName: "Иван",
      lastName: "Иванов",
      username: "ivanov",
      languageCode: "ru",
      tags: [],
      variables: overrides.variables ?? { city: "Москва", score: 42 },
      customFields: {},
      subscribedAt: new Date("2026-05-13T10:00:00Z"),
    },
    bot: {
      id: "bot-1",
      username: "demo_bot",
      title: "Demo",
      projectVariables: {},
      constants: {},
      timezone: "UTC",
    },
    run: overrides.runContext
      ? { id: "run-1", flowId: "flow-1", currentNodeId: null, context: overrides.runContext }
      : undefined,
  });
}

describe("tg/vars", () => {
  it("substitutes user.first_name", () => {
    expect(renderTemplate("Привет, {{user.first_name}}!", makeCtx())).toBe("Привет, Иван!");
  });

  it("substitutes vars.<key>", () => {
    expect(
      renderTemplate("Город: {{vars.city}}, баллы: {{vars.score}}", makeCtx())
    ).toBe("Город: Москва, баллы: 42");
  });

  it("supports the SaleBot-style client.x alias", () => {
    expect(
      renderTemplate("Город: {{client.city}}", makeCtx())
    ).toBe("Город: Москва");
  });

  it("nested ctx path works", () => {
    const ctx = makeCtx({ runContext: { http: { status: "ok" } } });
    expect(renderTemplate("HTTP: {{ctx.http.status}}", ctx)).toBe("HTTP: ok");
  });

  it("unknown placeholder renders empty", () => {
    expect(renderTemplate("X{{vars.missing}}Y", makeCtx())).toBe("XY");
  });

  it("ignores non-placeholder braces", () => {
    expect(renderTemplate("{this is fine}", makeCtx())).toBe("{this is fine}");
  });
});
