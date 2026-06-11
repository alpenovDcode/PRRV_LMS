// Period parser used by every analytics API route.
// Accepts either `period=today|yesterday|7d|30d|90d` (preferred) or
// explicit `from=ISO&to=ISO`. Defaults to last 30 days when nothing is set.

export type PeriodInput = {
  period?: string | null;
  from?: string | null;
  to?: string | null;
};

export type PeriodLabel = "today" | "yesterday" | "7d" | "30d" | "90d" | "custom";

export interface ParsedPeriod {
  from: Date;
  to: Date;
  label: PeriodLabel;
}

// «Дневные» пресеты — границы привязаны к локальным суткам сервера
// (контейнер обычно в UTC; для MSK-аналитики разница 3 часа допустима,
// серьёзный TZ-фикс можно сделать через настройку TgBot.timezone).
const ROLLING_DAYS: Record<string, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

/** Начало суток (00:00:00.000) от данной даты в локальной TZ сервера. */
function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}
/** Конец суток (23:59:59.999) от данной даты в локальной TZ сервера. */
function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

export function parsePeriod(input: PeriodInput, now: Date = new Date()): ParsedPeriod {
  // Explicit custom range wins if both `from` and `to` are valid.
  if (input.from && input.to) {
    const f = new Date(input.from);
    const t = new Date(input.to);
    if (!Number.isNaN(f.getTime()) && !Number.isNaN(t.getTime()) && f.getTime() <= t.getTime()) {
      return { from: f, to: t, label: "custom" };
    }
  }

  // Дневные пресеты.
  if (input.period === "today") {
    return { from: startOfDay(now), to: endOfDay(now), label: "today" };
  }
  if (input.period === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return { from: startOfDay(y), to: endOfDay(y), label: "yesterday" };
  }

  // Скользящие окна 7d/30d/90d — от now − N дней до now.
  const presetKey = input.period && ROLLING_DAYS[input.period] ? input.period : "30d";
  const days = ROLLING_DAYS[presetKey];
  const to = now;
  const from = new Date(to.getTime() - days * 24 * 3600 * 1000);
  return { from, to, label: presetKey as PeriodLabel };
}

// Helper for URL building on the client.
export function periodToQuery(p: ParsedPeriod): Record<string, string> {
  if (p.label === "custom") {
    return { from: p.from.toISOString(), to: p.to.toISOString() };
  }
  return { period: p.label };
}
