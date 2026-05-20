// Tests for the composite position key. The audit found that if two
// flows happen to share a node id (e.g. both use "welcome" as entry),
// the previous nodeId-only positionGroupId would cross-cancel runs
// belonging to the wrong flow. positionKey() prevents this by
// qualifying with flowId.

import { describe, it, expect } from "vitest";
import { positionKey } from "../flow-engine";

describe("positionKey", () => {
  it("returns flowId:nodeId composite", () => {
    expect(positionKey("flow-A", "welcome")).toBe("flow-A:welcome");
    expect(positionKey("flow-B", "welcome")).toBe("flow-B:welcome");
  });

  it("distinguishes same-nodeId across flows", () => {
    const a = positionKey("flow-A", "welcome");
    const b = positionKey("flow-B", "welcome");
    expect(a).not.toBe(b);
  });

  it("returns null when flowId is missing", () => {
    expect(positionKey(null, "welcome")).toBeNull();
    expect(positionKey(undefined, "welcome")).toBeNull();
  });

  it("returns null when nodeId is missing", () => {
    expect(positionKey("flow-A", null)).toBeNull();
    expect(positionKey("flow-A", undefined)).toBeNull();
  });

  it("returns null when both missing", () => {
    expect(positionKey(null, null)).toBeNull();
  });
});
