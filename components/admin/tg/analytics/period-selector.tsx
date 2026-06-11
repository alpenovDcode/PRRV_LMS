"use client";

// Period selector — keeps state in the URL so sub-tab navigation
// preserves the user's choice. Supports day/rolling presets and a
// custom range via two date inputs.

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const PRESETS = [
  { key: "today", label: "Сегодня" },
  { key: "yesterday", label: "Вчера" },
  { key: "7d", label: "7 дней" },
  { key: "30d", label: "30 дней" },
  { key: "90d", label: "90 дней" },
] as const;

/** ISO в формате YYYY-MM-DD → 00:00 локального времени. */
function dateAtStart(ymd: string): Date {
  const d = new Date(ymd);
  d.setHours(0, 0, 0, 0);
  return d;
}
/** ISO в формате YYYY-MM-DD → 23:59:59.999 локального времени. */
function dateAtEnd(ymd: string): Date {
  const d = new Date(ymd);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Если строка похожа на YYYY-MM-DD — берём как есть; иначе обрезаем ISO. */
function ymdFromUrl(s: string | null): string {
  if (!s) return "";
  return s.slice(0, 10);
}

export function PeriodSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const current =
    sp.get("period") ?? (sp.get("from") && sp.get("to") ? "custom" : "30d");

  const [customFrom, setCustomFrom] = useState(ymdFromUrl(sp.get("from")));
  const [customTo, setCustomTo] = useState(ymdFromUrl(sp.get("to")));
  const [open, setOpen] = useState(current === "custom");
  const [error, setError] = useState<string | null>(null);

  function go(period: string) {
    const next = new URLSearchParams(sp);
    next.delete("from");
    next.delete("to");
    next.set("period", period);
    router.push(`${pathname}?${next.toString()}`);
    setOpen(false);
    setError(null);
  }

  function applyCustom() {
    if (!customFrom || !customTo) {
      setError("Выберите обе даты");
      return;
    }
    const f = dateAtStart(customFrom);
    const t = dateAtEnd(customTo); // ← конец дня, иначе диапазон 0 секунд
    if (t.getTime() < f.getTime()) {
      setError("«До» раньше чем «От»");
      return;
    }
    const next = new URLSearchParams(sp);
    next.delete("period");
    next.set("from", f.toISOString());
    next.set("to", t.toISOString());
    router.push(`${pathname}?${next.toString()}`);
    setOpen(false);
    setError(null);
  }

  const canApply = !!(customFrom && customTo);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="text-xs text-muted-foreground">Период:</div>
      {PRESETS.map((p) => (
        <button
          key={p.key}
          onClick={() => go(p.key)}
          className={cn(
            "rounded border px-2 py-1 text-xs",
            current === p.key
              ? "border-primary bg-primary/10 text-primary font-medium"
              : "border-input text-muted-foreground hover:text-foreground"
          )}
        >
          {p.label}
        </button>
      ))}
      <button
        onClick={() => {
          setOpen((v) => !v);
          setError(null);
        }}
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
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            value={customFrom}
            onChange={(e) => {
              setCustomFrom(e.target.value);
              setError(null);
            }}
            className="h-8 w-36 text-xs"
          />
          <span className="text-xs text-muted-foreground">—</span>
          <Input
            type="date"
            value={customTo}
            onChange={(e) => {
              setCustomTo(e.target.value);
              setError(null);
            }}
            className="h-8 w-36 text-xs"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={applyCustom}
            disabled={!canApply}
          >
            Применить
          </Button>
          {error && (
            <span className="text-xs text-rose-600">{error}</span>
          )}
        </div>
      )}
    </div>
  );
}
