"use client";

// Reads the analytics period from the current URL and returns the
// matching axios `params` blob so the same hook can be reused
// across every dashboard.

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

export function usePeriodParams(): Record<string, string> {
  const sp = useSearchParams();
  return useMemo<Record<string, string>>(() => {
    const period = sp.get("period");
    const from = sp.get("from");
    const to = sp.get("to");
    const out: Record<string, string> = {};
    if (from && to) {
      out.from = from;
      out.to = to;
    } else if (period) {
      out.period = period;
    } else {
      out.period = "30d";
    }
    return out;
  }, [sp]);
}
