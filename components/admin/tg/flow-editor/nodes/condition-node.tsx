"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { NodeShell } from "./node-shell";
import type { FlowNode } from "@/lib/tg/flow-schema";

function ruleSummary(
  rule: { kind: string; params: Record<string, unknown> }
): string {
  if (rule.kind === "always") return "всегда";
  if (rule.kind === "tag") {
    const op = String(rule.params.op ?? "has");
    const v = String(rule.params.value ?? "");
    return `тег ${op === "has" ? "=" : "≠"} ${v}`;
  }
  if (rule.kind === "variable") {
    const key = String(rule.params.key ?? "");
    const op = String(rule.params.op ?? "eq");
    const v = rule.params.value !== undefined ? String(rule.params.value) : "";
    return `${key} ${op} ${v}`;
  }
  return rule.kind;
}

function ConditionNodeRaw(props: NodeProps) {
  const node = (props.data as { schemaNode: FlowNode }).schemaNode;
  if (node.type !== "condition") return null;
  const ruleCount = node.rules.length;
  // Each rule gets its own right-side handle. Use NodeShell's default top input
  // and add right + bottom handles manually so we have per-rule labels.
  return (
    <div
      className={`rounded-lg border bg-white shadow-md w-[260px] relative ${
        props.selected ? "border-purple-500 ring-2 ring-purple-500 ring-offset-1" : "border-zinc-200"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2.5 !w-2.5 !bg-purple-600 !border-2 !border-white"
      />
      <div className="px-3 py-2 text-xs font-semibold border-b border-zinc-100 rounded-t-lg bg-fuchsia-50 text-fuchsia-700">
        ⚡ {node.label ?? "Условие"}
      </div>
      <div className="px-3 py-2 text-xs text-zinc-600 space-y-1">
        {node.rules.map((r, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between gap-2 relative py-0.5"
          >
            <span className="truncate">
              {idx + 1}. {ruleSummary(r)}
            </span>
            <Handle
              type="source"
              position={Position.Right}
              id={`rule-${idx}`}
              className="!h-2.5 !w-2.5 !bg-fuchsia-500 !border-2 !border-white"
              style={{ top: "50%", right: -5 }}
            />
          </div>
        ))}
        {ruleCount === 0 && <div className="text-zinc-400 italic">нет правил</div>}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-zinc-100 text-zinc-500 italic relative">
          <span>иначе →</span>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        id="default"
        className="!h-2.5 !w-2.5 !bg-purple-600 !border-2 !border-white"
      />
    </div>
  );
}

export const ConditionNode = memo(ConditionNodeRaw);
