"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { NodeShell } from "./node-shell";
import type { FlowNode } from "@/lib/tg/flow-schema";

export function humanizeSeconds(s: number): string {
  if (s < 60) return `${s} сек`;
  if (s < 3600) return `${Math.round(s / 60)} мин`;
  if (s < 86400) return `${Math.round((s / 3600) * 10) / 10} ч`;
  return `${Math.round((s / 86400) * 10) / 10} дн`;
}

function DelayNodeRaw(props: NodeProps) {
  const node = (props.data as { schemaNode: FlowNode }).schemaNode;
  if (node.type !== "delay") return null;
  return (
    <NodeShell type="delay" selected={props.selected} title={<span>⏰ {node.label ?? "Задержка"}</span>}>
      <div className="font-medium">{humanizeSeconds(node.seconds)}</div>
    </NodeShell>
  );
}

export const DelayNode = memo(DelayNodeRaw);
