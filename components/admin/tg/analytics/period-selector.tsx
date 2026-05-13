"use client";

// Period selector — keeps state in the URL so sub-tab navigation
// preserves the user's choice. Supports the three presets and a
// custom range via two date inputs.

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const PRESETS = ["7d", "30d", "90d"] as const;

export function PeriodSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const current = sp.get("period") ?? (sp.get("from") && sp.get("to") ? "custom" : "30d");

  const [customFrom, setCustomFrom] = useState(sp.get("from") ?? "");
  const [customTo, setCustomTo] = useState(sp.get("to") ?? "");
  const [open, setOpen] = useState(current === "custom");

  function go(period: string) {
    const next = new URLSearchParams(sp);
    next.delete("from");
    next.delete("to");
    next.set("period", period);
    router.push(`${pathname}?${next.toString()}`);
    setOpen(false);
  }

  function applyCustom() {
    if (!customFrom || !customTo) return;
    const next = new URLSearchParams(sp);
    next.delete("period");
    next.set("from", new Date(customFrom).toISOString());
    next.set("to", new Date(customTo).toISOString());
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="text-xs text-muted-foreground">Период:</div>
      {PRESETS.map((p) => (
        <button
          key={p}
          onClick={() => go(p)}
          className={cn(
            "rounded border px-2 py-1 text-xs",
            current === p
              ? "border-primary bg-primary/10 text-primary font-medium"
              : "border-input text-muted-foreground hover:text-foreground"
          )}
        >
          {p === "7d" ? "7 дней" : p === "30d" ? "30 дней" : "90 дней"}
        </button>
      ))}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "rounded border px-2 py-1 text-xs",
          current === "custom"
            ? "border-primary bg-primary/10 text-primary font-medium"
            : "border-input text-muted-foreground hover:text-foreground"
        )}
      >
        Свой диапазон
      </button>
      {open && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={customFrom?.slice(0, 10)}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="h-8 w-36 text-xs"
          />
          <span className="text-xs text-muted-foreground">—</span>
          <Input
            type="date"
            value={customTo?.slice(0, 10)}
            onChange={(e) => setCustomTo(e.target.value)}
            className="h-8 w-36 text-xs"
          />
          <Button size="sm" variant="outline" onClick={applyCustom}>
            Применить
          </Button>
        </div>
      )}
    </div>
  );
}
