// Period parser used by every analytics API route.
// Accepts either `period=7d|30d|90d` (preferred) or explicit
// `from=ISO&to=ISO`. Defaults to last 30 days when nothing is set.

export type PeriodInput = {
  period?: string | null;
  from?: string | null;
  to?: string | null;
};

export interface ParsedPeriod {
  from: Date;
  to: Date;
  // Original input echoed back so the client can confirm what was used.
  label: "7d" | "30d" | "90d" | "custom";
}

const KNOWN_PRESETS: Record<string, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export function parsePeriod(input: PeriodInput, now: Date = new Date()): ParsedPeriod {
  // Explicit custom range wins if both `from` and `to` are valid.
  if (input.from && input.to) {
    const f = new Date(input.from);
    const t = new Date(input.to);
    if (!Number.isNaN(f.getTime()) && !Number.isNaN(t.getTime()) && f.getTime() <= t.getTime()) {
      return { from: f, to: t, label: "custom" };
    }
  }
  const presetKey = input.period && KNOWN_PRESETS[input.period] ? input.period : "30d";
  const days = KNOWN_PRESETS[presetKey];
  const to = now;
  const from = new Date(to.getTime() - days * 24 * 3600 * 1000);
  return { from, to, label: presetKey as ParsedPeriod["label"] };
}

// Helper for URL building on the client.
export function periodToQuery(p: ParsedPeriod): Record<string, string> {
  if (p.label === "custom") {
    return { from: p.from.toISOString(), to: p.to.toISOString() };
  }
  return { period: p.label };
}
