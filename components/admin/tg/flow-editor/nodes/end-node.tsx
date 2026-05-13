"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { NodeShell } from "./node-shell";

function EndNodeRaw(props: NodeProps) {
  return (
    <NodeShell
      type="end"
      selected={props.selected}
      title={<span>⏹ Конец</span>}
      outputs={[]}
    >
      <span className="text-zinc-400">завершение сценария</span>
    </NodeShell>
  );
}

export const EndNode = memo(EndNodeRaw);
