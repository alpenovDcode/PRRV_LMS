"use client";

// A/B-split нода. Каждая ветка — отдельный handle справа, чтобы
// в редакторе можно было протянуть стрелку от каждой ветки отдельно.

import { memo } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { NodeShell } from "./node-shell";
import type { FlowNode } from "@/lib/tg/flow-schema";

function SplitNodeRaw(props: NodeProps) {
  const node = (props.data as { schemaNode?: FlowNode }).schemaNode;
  if (!node || node.type !== "split") return null;
  const branches = node.branches;
  const totalWeight = branches.reduce((s, b) => s + b.weight, 0);

  return (
    <NodeShell
      type="split"
      selected={props.selected}
      title={<span>🎲 {node.label ?? "A/B split"}</span>}
      outputs={branches.map((b, i) => ({
        id: `branch-${i}`,
        position: Position.Right,
        label: `${b.label} · ${Math.round((b.weight / totalWeight) * 100)}%`,
        // Распределяем handles вертикально по правому краю.
        topOffset: `${((i + 1) / (branches.length + 1)) * 100}%`,
      }))}
    >
      <div className="text-[11px] space-y-0.5">
        {branches.map((b, i) => (
          <div key={i} className="flex justify-between gap-2">
            <span className="font-medium text-pink-700 truncate">{b.label}</span>
            <span className="text-zinc-400">
              {Math.round((b.weight / totalWeight) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </NodeShell>
  );
}

export const SplitNode = memo(SplitNodeRaw);
