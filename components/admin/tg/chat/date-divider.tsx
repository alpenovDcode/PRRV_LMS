"use client";

import { formatDateDividerLabel } from "@/lib/tg/chat-helpers";

interface Props {
  date: Date;
}

export function DateDivider({ date }: Props) {
  const label = formatDateDividerLabel(date);
  return (
    <div className="my-3 flex items-center justify-center">
      <span className="rounded-full bg-zinc-200/70 px-3 py-0.5 text-[11px] font-medium text-zinc-700 shadow-sm">
        {label}
      </span>
    </div>
  );
}
