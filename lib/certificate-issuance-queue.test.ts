import { describe, expect, it } from "vitest";
import { evaluateCertificationResult } from "./certificate-issuance-queue";

describe("evaluateCertificationResult", () => {
  it("accepts a completed legacy certification when no threshold is configured", () => {
    expect(evaluateCertificationResult("plain legacy answer", null).passed).toBe(true);
  });

  it("requires the configured percentage", () => {
    const content = JSON.stringify({ _test_score: 8, _test_total: 10 });
    expect(evaluateCertificationResult(content, 80)).toMatchObject({
      passed: true,
      percentage: 80,
      passingScore: 80,
    });
    expect(evaluateCertificationResult(content, 81).passed).toBe(false);
  });

  it("does not pass malformed results when a threshold is configured", () => {
    expect(evaluateCertificationResult("{}", 1).passed).toBe(false);
  });
});
