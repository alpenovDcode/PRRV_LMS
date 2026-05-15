// Tests for the condition-node rule evaluator. Covers every rule
// kind (tag / variable / expr / always) and every op the engine
// branches on. Pure function — no DB.

import { describe, it, expect } from "vitest";
import { evalRule } from "../flow-engine";
import { buildEvalContext } from "../vars";
import type {
  SubscriberSnapshot,
  BotSnapshot,
  RunSnapshot,
} from "../vars";

function makeCtx(overrides: Partial<SubscriberSnapshot> = {}) {
  const sub: SubscriberSnapshot = {
    id: "sub-1",
    chatId: "100",
    firstName: "Иван",
    lastName: null,
    username: null,
    languageCode: "ru",
    tags: ["vip"],
    variables: { age: 25, score: "12.5", email: "a@b.com" },
    customFields: { phone: "79991234567" },
    subscribedAt: new Date("2026-05-13T10:00:00Z"),
    ...overrides,
  };
  const bot: BotSnapshot = {
    id: "bot-1",
    username: "u",
    title: "t",
    projectVariables: { brand: "Acme" },
    constants: { tax: "0.2" },
    timezone: "UTC",
  };
  const run: RunSnapshot = {
    id: "run-1",
    flowId: "flow-1",
    currentNodeId: null,
    context: { utm: "fb" },
  };
  return { sub, bot, run, evalCtx: buildEvalContext({ subscriber: sub, bot, run }) };
}

describe("evalRule — always", () => {
  it("always matches", () => {
    expect(evalRule({ kind: "always", params: {} }, makeCtx())).toBe(true);
  });
});

describe("evalRule — tag", () => {
  it("matches when subscriber has the tag", () => {
    expect(evalRule(
      { kind: "tag", params: { op: "has", value: "vip" } },
      makeCtx(),
    )).toBe(true);
  });
  it("doesn't match when subscriber lacks the tag", () => {
    expect(evalRule(
      { kind: "tag", params: { op: "has", value: "missing" } },
      makeCtx(),
    )).toBe(false);
  });
  it("not_has inverts", () => {
    expect(evalRule(
      { kind: "tag", params: { op: "not_has", value: "vip" } },
      makeCtx(),
    )).toBe(false);
    expect(evalRule(
      { kind: "tag", params: { op: "not_has", value: "missing" } },
      makeCtx(),
    )).toBe(true);
  });
});

describe("evalRule — variable: existence", () => {
  it("exists succeeds for present value", () => {
    expect(evalRule(
      { kind: "variable", params: { key: "client.age", op: "exists" } },
      makeCtx(),
    )).toBe(true);
  });
  it("exists fails for empty string", () => {
    expect(evalRule(
      { kind: "variable", params: { key: "client.unknown", op: "exists" } },
      makeCtx(),
    )).toBe(false);
  });
  it("not_exists inverts", () => {
    expect(evalRule(
      { kind: "variable", params: { key: "client.unknown", op: "not_exists" } },
      makeCtx(),
    )).toBe(true);
  });
});

describe("evalRule — variable: equality", () => {
  it("eq matches when actual equals expected (string compared)", () => {
    expect(evalRule(
      { kind: "variable", params: { key: "client.age", op: "eq", value: "25" } },
      makeCtx(),
    )).toBe(true);
  });
  it("eq does NOT match when actual differs", () => {
    expect(evalRule(
      { kind: "variable", params: { key: "client.age", op: "eq", value: "30" } },
      makeCtx(),
    )).toBe(false);
  });
  it("ne inverts eq", () => {
    expect(evalRule(
      { kind: "variable", params: { key: "client.age", op: "ne", value: "30" } },
      makeCtx(),
    )).toBe(true);
  });
});

describe("evalRule — variable: numeric ops", () => {
  it("gt strictly greater", () => {
    expect(evalRule(
      { kind: "variable", params: { key: "client.age", op: "gt", value: "20" } },
      makeCtx(),
    )).toBe(true);
    expect(evalRule(
      { kind: "variable", params: { key: "client.age", op: "gt", value: "25" } },
      makeCtx(),
    )).toBe(false);
  });
  it("gte inclusive", () => {
    expect(evalRule(
      { kind: "variable", params: { key: "client.age", op: "gte", value: "25" } },
      makeCtx(),
    )).toBe(true);
  });
  it("lt and lte", () => {
    expect(evalRule(
      { kind: "variable", params: { key: "client.age", op: "lt", value: "30" } },
      makeCtx(),
    )).toBe(true);
    expect(evalRule(
      { kind: "variable", params: { key: "client.age", op: "lte", value: "25" } },
      makeCtx(),
    )).toBe(true);
  });
  it("returns false when value is non-numeric", () => {
    expect(evalRule(
      { kind: "variable", params: { key: "client.email", op: "gt", value: "10" } },
      makeCtx(),
    )).toBe(false);
  });
  it("works with float values stored as strings", () => {
    expect(evalRule(
      { kind: "variable", params: { key: "client.score", op: "gt", value: "12" } },
      makeCtx(),
    )).toBe(true);
  });
});

describe("evalRule — variable: contains", () => {
  it("substring contains", () => {
    expect(evalRule(
      { kind: "variable", params: { key: "client.email", op: "contains", value: "@b.com" } },
      makeCtx(),
    )).toBe(true);
  });
  it("case-insensitive", () => {
    expect(evalRule(
      { kind: "variable", params: { key: "client.email", op: "contains", value: "A@B" } },
      makeCtx(),
    )).toBe(true);
  });
});

describe("evalRule — variable: scope routing", () => {
  it("project.x reads from project scope", () => {
    expect(evalRule(
      { kind: "variable", params: { key: "project.brand", op: "eq", value: "Acme" } },
      makeCtx(),
    )).toBe(true);
  });
  it("deal.x reads from run context", () => {
    expect(evalRule(
      { kind: "variable", params: { key: "deal.utm", op: "eq", value: "fb" } },
      makeCtx(),
    )).toBe(true);
  });
  it("field.x reads from customFields", () => {
    expect(evalRule(
      { kind: "variable", params: { key: "field.phone", op: "contains", value: "799" } },
      makeCtx(),
    )).toBe(true);
  });
});

describe("evalRule — expr", () => {
  it("evaluates a boolean expression", () => {
    expect(evalRule(
      { kind: "expr", params: { expr: "client.age >= 18 and in_array(tags, 'vip')" } },
      makeCtx(),
    )).toBe(true);
  });
  it("returns false on syntax error (fail-closed)", () => {
    expect(evalRule(
      { kind: "expr", params: { expr: "1 +" } },
      makeCtx(),
    )).toBe(false);
  });
  it("empty expr returns false", () => {
    expect(evalRule({ kind: "expr", params: { expr: "" } }, makeCtx())).toBe(false);
  });
  it("supports date math in conditions", () => {
    expect(evalRule(
      { kind: "expr", params: { expr: "'15.05.2026' - '10.05.2026' > 3" } },
      makeCtx(),
    )).toBe(true);
  });
});

describe("evalRule — unknown kind", () => {
  it("returns false safely", () => {
    expect(evalRule(
      { kind: "garbage", params: {} },
      makeCtx(),
    )).toBe(false);
  });
});
