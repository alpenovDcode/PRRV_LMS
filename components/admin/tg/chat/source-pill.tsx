"use client";

import { cn } from "@/lib/utils";
import type { SourcePillDescriptor } from "@/lib/tg/chat-helpers";

const TONE_CLASSES: Record<SourcePillDescriptor["tone"], string> = {
  info: "bg-blue-50 text-blue-700 border-blue-200",
  neutral: "bg-zinc-100 text-zinc-700 border-zinc-200",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
};

interface Props {
  descriptor: SourcePillDescriptor;
  align?: "left" | "right";
}

export function SourcePill({ descriptor, align = "left" }: Props) {
  return (
    <div
      className={cn(
        "flex w-full pt-1",
        align === "right" ? "justify-end" : "justify-start"
      )}
    >
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] leading-tight",
          TONE_CLASSES[descriptor.tone]
        )}
      >
        <span aria-hidden>{descriptor.icon}</span>
        <span>{descriptor.label}</span>
      </span>
    </div>
  );
}
