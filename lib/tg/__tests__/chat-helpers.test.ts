import { describe, expect, it } from "vitest";
import {
  collectSourceRefs,
  describeSource,
  formatDateDividerLabel,
  groupMessagesIntoBursts,
} from "../chat-helpers";

describe("tg/chat-helpers/groupMessagesIntoBursts", () => {
  it("collapses same-direction same-day messages into one burst", () => {
    const t = "2026-05-13T10:00:00Z";
    const bursts = groupMessagesIntoBursts([
      { id: "1", direction: "in", createdAt: t },
      { id: "2", direction: "in", createdAt: "2026-05-13T10:00:05Z" },
      { id: "3", direction: "out", createdAt: "2026-05-13T10:01:00Z" },
      { id: "4", direction: "out", createdAt: "2026-05-13T10:01:30Z" },
      { id: "5", direction: "in", createdAt: "2026-05-13T10:02:00Z" },
    ]);
    expect(bursts).toHaveLength(3);
    expect(bursts[0].direction).toBe("in");
    expect(bursts[0].messages.map((m) => m.id)).toEqual(["1", "2"]);
    expect(bursts[1].direction).toBe("out");
    expect(bursts[1].messages.map((m) => m.id)).toEqual(["3", "4"]);
    expect(bursts[2].messages.map((m) => m.id)).toEqual(["5"]);
  });

  it("starts a new burst when the calendar day changes even within one direction", () => {
    const bursts = groupMessagesIntoBursts([
      { id: "a", direction: "out", createdAt: new Date("2026-05-12T22:00:00") },
      { id: "b", direction: "out", createdAt: new Date("2026-05-13T01:00:00") },
    ]);
    expect(bursts).toHaveLength(2);
    expect(bursts[0].messages[0].id).toBe("a");
    expect(bursts[1].messages[0].id).toBe("b");
  });

  it("handles an empty list", () => {
    expect(groupMessagesIntoBursts([])).toEqual([]);
  });
});

describe("tg/chat-helpers/formatDateDividerLabel", () => {
  const now = new Date(2026, 4, 13, 12, 0, 0); // 13 May 2026

  it("renders today", () => {
    expect(formatDateDividerLabel(new Date(2026, 4, 13, 8, 30), now)).toBe("Сегодня");
  });

  it("renders yesterday", () => {
    expect(formatDateDividerLabel(new Date(2026, 4, 12, 23, 0), now)).toBe("Вчера");
  });

  it("renders same-year date without the year", () => {
    expect(formatDateDividerLabel(new Date(2026, 0, 5), now)).toBe("5 января");
  });

  it("renders prior-year date with the year", () => {
    expect(formatDateDividerLabel(new Date(2024, 11, 31), now)).toBe("31 декабря 2024");
  });
});

describe("tg/chat-helpers/describeSource", () => {
  it("returns null for plain inbound text", () => {
    expect(
      describeSource({
        direction: "in",
        sourceType: "inbound",
        sourceId: null,
        callbackData: null,
      })
    ).toBeNull();
  });

  it("describes a callback click on inbound", () => {
    const d = describeSource({
      direction: "in",
      sourceType: "callback",
      sourceId: null,
      callbackData: "btn_ok",
    });
    expect(d?.icon).toBe("🔘");
    expect(d?.label).toContain("btn_ok");
  });

  it("describes a flow-sourced outbound with node label", () => {
    const d = describeSource({
      direction: "out",
      sourceType: "flow",
      sourceId: "flow-1:node-greeting",
      callbackData: null,
      flowName: "Welcome",
      nodeLabel: "Greeting",
    });
    expect(d?.label).toBe("Welcome → Greeting");
  });

  it("falls back to nodeId when no label", () => {
    const d = describeSource({
      direction: "out",
      sourceType: "flow",
      sourceId: "flow-1:n42",
      callbackData: null,
      flowName: "Welcome",
    });
    expect(d?.label).toBe("Welcome → n42");
  });

  it("describes broadcast/manual/trigger", () => {
    expect(
      describeSource({
        direction: "out",
        sourceType: "broadcast",
        sourceId: "bc-1",
        callbackData: null,
        broadcastName: "Promo",
      })?.label
    ).toBe("Promo");
    expect(
      describeSource({
        direction: "out",
        sourceType: "manual",
        sourceId: null,
        callbackData: null,
      })?.label
    ).toBe("оператор");
    expect(
      describeSource({
        direction: "out",
        sourceType: "trigger",
        sourceId: null,
        callbackData: null,
      })?.label
    ).toBe("триггер");
  });
});

describe("tg/chat-helpers/collectSourceRefs", () => {
  it("dedupes flow and broadcast ids", () => {
    const r = collectSourceRefs([
      { sourceType: "flow", sourceId: "f1:n1" },
      { sourceType: "flow", sourceId: "f1:n2" },
      { sourceType: "flow", sourceId: "f2:n1" },
      { sourceType: "broadcast", sourceId: "b1" },
      { sourceType: "broadcast", sourceId: "b1" },
      { sourceType: "manual", sourceId: null },
    ]);
    expect(r.flowIds.sort()).toEqual(["f1", "f2"]);
    expect(r.broadcastIds).toEqual(["b1"]);
  });
});
