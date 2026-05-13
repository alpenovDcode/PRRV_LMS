"use client";

import { Handle, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export const NODE_HEAD_COLORS: Record<string, string> = {
  trigger: "bg-violet-50 text-violet-700 border-violet-200",
  message: "bg-blue-50 text-blue-700",
  delay: "bg-amber-50 text-amber-700",
  wait_reply: "bg-rose-50 text-rose-700",
  condition: "bg-fuchsia-50 text-fuchsia-700",
  add_tag: "bg-cyan-50 text-cyan-700",
  remove_tag: "bg-cyan-50 text-cyan-700",
  set_variable: "bg-violet-50 text-violet-700",
  http_request: "bg-lime-50 text-lime-700",
  goto_flow: "bg-purple-50 text-purple-700",
  end: "bg-zinc-100 text-zinc-600",
};

interface NodeShellProps {
  type: keyof typeof NODE_HEAD_COLORS;
  selected?: boolean;
  title: ReactNode;
  children?: ReactNode;
  // Handles to render. We default to a single top input + single bottom output
  // for most nodes; multi-handle nodes pass their own.
  inputs?: Array<{ id?: string; position?: Position }>;
  outputs?: Array<{ id?: string; position?: Position; label?: string; topOffset?: string }>;
  // Border accent for selected state.
  isStart?: boolean;
}

export function NodeShell({
  type,
  selected,
  title,
  children,
  inputs = [{}],
  outputs = [{}],
  isStart,
}: NodeShellProps) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-white shadow-md w-[240px] relative",
        selected
          ? "border-purple-500 ring-2 ring-purple-500 ring-offset-1"
          : "border-zinc-200",
        isStart && !selected && "border-violet-400"
      )}
    >
      {inputs.map((input, i) => (
        <Handle
          key={`in-${i}`}
          type="target"
          position={input.position ?? Position.Top}
          id={input.id}
          className="!h-2.5 !w-2.5 !bg-purple-600 !border-2 !border-white"
        />
      ))}
      <div
        className={cn(
          "px-3 py-2 text-xs font-semibold border-b border-zinc-100 rounded-t-lg",
          NODE_HEAD_COLORS[type] ?? ""
        )}
      >
        {title}
      </div>
      <div className="px-3 py-2 text-xs text-zinc-600">{children}</div>
      {outputs.map((output, i) => (
        <Handle
          key={`out-${i}`}
          type="source"
          position={output.position ?? Position.Bottom}
          id={output.id}
          className="!h-2.5 !w-2.5 !bg-purple-600 !border-2 !border-white"
          style={
            output.position === Position.Right
              ? { top: output.topOffset ?? "50%" }
              : undefined
          }
        >
          {output.label && (
            <span className="absolute -translate-x-1/2 left-1/2 top-3 text-[9px] text-zinc-400 whitespace-nowrap pointer-events-none">
              {output.label}
            </span>
          )}
        </Handle>
      ))}
    </div>
  );
}
