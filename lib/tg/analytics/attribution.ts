// Attribution bucket helpers — derive the grouping key for a row
// based on the link's UTM blob. `groupBy` is one of:
//   - 'source'   → utm.utm_source || 'unknown'
//   - 'campaign' → utm.utm_campaign || 'unknown'
//   - 'slug'     → tracking link slug
// Subscribers without any slug are bucketed as "organic".

export type AttributionGroupBy = "source" | "campaign" | "slug";

export interface BucketInputLink {
  slug: string;
  utm: Record<string, unknown> | null | undefined;
  clickCount: number;
}

export function bucketKeyForLink(link: BucketInputLink, groupBy: AttributionGroupBy): string {
  if (groupBy === "slug") return link.slug;
  const utm = (link.utm ?? {}) as Record<string, unknown>;
  const field = groupBy === "source" ? "utm_source" : "utm_campaign";
  const raw = utm[field];
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return "unknown";
}

// Aggregate a set of links into bucket totals so the API can join
// against attributed-subscriber counts.
export function aggregateLinkBuckets(
  links: BucketInputLink[],
  groupBy: AttributionGroupBy
): Map<string, { clicks: number; slugs: string[] }> {
  const out = new Map<string, { clicks: number; slugs: string[] }>();
  for (const l of links) {
    const key = bucketKeyForLink(l, groupBy);
    const cur = out.get(key);
    if (cur) {
      cur.clicks += l.clickCount;
      cur.slugs.push(l.slug);
    } else {
      out.set(key, { clicks: l.clickCount, slugs: [l.slug] });
    }
  }
  return out;
}

// Decide if a row should be flagged as "problematic" per spec:
// clicks→subscribed < 30% and clicks > 50.
export function isProblematic(clicks: number, subscribed: number): boolean {
  if (clicks <= 50) return false;
  const conv = clicks > 0 ? subscribed / clicks : 0;
  return conv < 0.3;
}
