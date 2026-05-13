"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { NodeShell } from "./node-shell";
import type { FlowNode } from "@/lib/tg/flow-schema";

interface GotoFlowNodeData {
  schemaNode: FlowNode;
  flowName?: string;
}

function GotoFlowNodeRaw(props: NodeProps) {
  const data = props.data as unknown as GotoFlowNodeData;
  const node = data.schemaNode;
  if (node.type !== "goto_flow") return null;
  return (
    <NodeShell type="goto_flow" selected={props.selected} title={<span>↪ Прыжок</span>}>
      <div className="truncate">
        {data.flowName ? (
          <span className="text-purple-700 font-medium">{data.flowName}</span>
        ) : (
          <span className="font-mono text-[11px] text-zinc-500">{node.flowId}</span>
        )}
      </div>
    </NodeShell>
  );
}

export const GotoFlowNode = memo(GotoFlowNodeRaw);
