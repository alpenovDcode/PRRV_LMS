// Map a 0..100 retention value to one of a fixed set of Tailwind
// purple background classes. Returning the full class names (not
// fragments) is intentional — Tailwind's purger only sees full class
// names at build time.

export function retentionBgClass(value: number | null): string {
  if (value == null) return "bg-muted/30 text-muted-foreground";
  if (value >= 60) return "bg-purple-700 text-white";
  if (value >= 45) return "bg-purple-600 text-white";
  if (value >= 30) return "bg-purple-500 text-white";
  if (value >= 20) return "bg-purple-400 text-white";
  if (value >= 10) return "bg-purple-300 text-purple-900";
  if (value > 0) return "bg-purple-200 text-purple-900";
  return "bg-purple-50 text-purple-900";
}

// Format average seconds into a human-friendly label like "1h 23m" or "47s".
export function humanizeSeconds(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return rem ? `${m}m ${rem}s` : `${m}m`;
  }
  if (s < 24 * 3600) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  return h ? `${d}d ${h}h` : `${d}d`;
}
