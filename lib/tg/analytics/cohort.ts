// Cohort math helpers — pure, no DB. Weeks are ISO weeks (Monday
// start) in UTC. The DB stores timestamps in UTC, so we anchor on
// `Date.UTC` to avoid the off-by-one timezone bug.

const WEEK_MS = 7 * 24 * 3600 * 1000;

// Floor a Date down to the Monday 00:00 UTC of its ISO week.
export function isoWeekStartUTC(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // getUTCDay: Sun=0 .. Sat=6. ISO Monday = 1.
  const day = d.getUTCDay();
  const offset = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - offset);
  return d;
}

// How many full ISO weeks since the cohort start does a given date fall
// into. Negative for dates before the cohort.
export function weekIndex(cohortStart: Date, when: Date): number {
  return Math.floor((when.getTime() - cohortStart.getTime()) / WEEK_MS);
}

// Generate the last N ISO weeks ending at `endingWeek` (inclusive),
// from oldest -> newest. Used to build the cohort axis.
export function lastNIsoWeeks(endingWeek: Date, n: number): Date[] {
  const out: Date[] = [];
  for (let i = n - 1; i >= 0; i--) {
    out.push(new Date(endingWeek.getTime() - i * WEEK_MS));
  }
  return out;
}

// Build a NxM retention grid. `cohorts` is the array of week starts
// (oldest first). `members` maps weekStart->subscriberId[]. `events`
// is the qualifying-event timeline (subscriberId, occurredAt).
// `maxWeeks` is how many follow-up weeks to compute (week0..weekN-1).
//
// Returns retention percentages (0..100). Cells for weeks the cohort
// hasn't lived through yet are `null`.
export function buildRetentionGrid(args: {
  now: Date;
  cohorts: Date[];
  members: Map<string, Set<string>>;
  events: Array<{ subscriberId: string; occurredAt: Date }>;
  maxWeeks: number;
}): Array<{ weekStart: string; size: number; weeks: Array<number | null> }> {
  const { now, cohorts, members, events, maxWeeks } = args;
  const out: Array<{ weekStart: string; size: number; weeks: Array<number | null> }> = [];

  // Group events by subscriber for O(1) lookups inside the cohort loop.
  const eventsBySub = new Map<string, Date[]>();
  for (const e of events) {
    const arr = eventsBySub.get(e.subscriberId);
    if (arr) arr.push(e.occurredAt);
    else eventsBySub.set(e.subscriberId, [e.occurredAt]);
  }

  for (const weekStart of cohorts) {
    const subs = members.get(weekStart.toISOString()) ?? new Set<string>();
    const size = subs.size;
    const weeks: Array<number | null> = [];
    for (let w = 0; w < maxWeeks; w++) {
      const winStart = new Date(weekStart.getTime() + w * WEEK_MS);
      const winEnd = new Date(weekStart.getTime() + (w + 1) * WEEK_MS);
      if (winStart.getTime() > now.getTime()) {
        // Future for this cohort.
        weeks.push(null);
        continue;
      }
      if (size === 0) {
        weeks.push(0);
        continue;
      }
      let active = 0;
      for (const subId of subs) {
        const times = eventsBySub.get(subId);
        if (!times) continue;
        // Linear scan is fine — cohorts are small (<=N subs * <=N events
        // per sub) and N caps at thousands per cohort.
        for (const t of times) {
          if (t.getTime() >= winStart.getTime() && t.getTime() < winEnd.getTime()) {
            active++;
            break;
          }
        }
      }
      weeks.push(Math.round((active / size) * 1000) / 10); // one decimal
    }
    out.push({ weekStart: weekStart.toISOString(), size, weeks });
  }
  return out;
}
