import { describe, expect, it } from "vitest";
import { aggregateLinkBuckets, bucketKeyForLink, isProblematic } from "../analytics/attribution";
import { parsePeriod } from "../analytics/period";

describe("analytics/attribution", () => {
  it("falls back to 'unknown' when utm_source is missing", () => {
    const key = bucketKeyForLink({ slug: "abc", utm: {}, clickCount: 0 }, "source");
    expect(key).toBe("unknown");
  });

  it("uses utm_source verbatim when present", () => {
    const key = bucketKeyForLink(
      { slug: "abc", utm: { utm_source: "instagram" }, clickCount: 0 },
      "source"
    );
    expect(key).toBe("instagram");
  });

  it("aggregates clicks across links with the same source", () => {
    const links = [
      { slug: "a", utm: { utm_source: "ig" }, clickCount: 5 },
      { slug: "b", utm: { utm_source: "ig" }, clickCount: 3 },
      { slug: "c", utm: { utm_source: "yt" }, clickCount: 10 },
    ];
    const agg = aggregateLinkBuckets(links, "source");
    expect(agg.get("ig")!.clicks).toBe(8);
    expect(agg.get("ig")!.slugs.sort()).toEqual(["a", "b"]);
    expect(agg.get("yt")!.clicks).toBe(10);
  });

  it("flags problematic rows: clicks > 50 and conv < 30%", () => {
    expect(isProblematic(100, 10)).toBe(true); // 10% conv
    expect(isProblematic(100, 35)).toBe(false); // 35% conv
    expect(isProblematic(40, 5)).toBe(false); // too few clicks
  });
});

describe("analytics/period", () => {
  it("defaults to 30d when nothing is passed", () => {
    const now = new Date("2025-05-12T12:00:00Z");
    const p = parsePeriod({}, now);
    expect(p.label).toBe("30d");
    expect(p.to.getTime()).toBe(now.getTime());
    expect(Math.round((p.to.getTime() - p.from.getTime()) / (24 * 3600 * 1000))).toBe(30);
  });

  it("respects 7d / 90d presets", () => {
    const now = new Date("2025-05-12T12:00:00Z");
    expect(parsePeriod({ period: "7d" }, now).label).toBe("7d");
    expect(parsePeriod({ period: "90d" }, now).label).toBe("90d");
  });

  it("falls back to default when period is unknown", () => {
    const now = new Date("2025-05-12T12:00:00Z");
    expect(parsePeriod({ period: "garbage" }, now).label).toBe("30d");
  });

  it("uses custom range when from/to are valid", () => {
    const p = parsePeriod({
      from: "2025-01-01T00:00:00Z",
      to: "2025-01-05T00:00:00Z",
    });
    expect(p.label).toBe("custom");
    expect(p.from.toISOString()).toBe("2025-01-01T00:00:00.000Z");
  });

  it("ignores custom range when from > to", () => {
    const now = new Date("2025-05-12T12:00:00Z");
    const p = parsePeriod(
      { from: "2025-06-01T00:00:00Z", to: "2025-01-01T00:00:00Z" },
      now
    );
    expect(p.label).toBe("30d");
  });
});
