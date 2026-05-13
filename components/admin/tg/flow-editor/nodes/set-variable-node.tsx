"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { NodeShell } from "./node-shell";
import type { FlowNode } from "@/lib/tg/flow-schema";

function SetVariableNodeRaw(props: NodeProps) {
  const node = (props.data as { schemaNode: FlowNode }).schemaNode;
  if (node.type !== "set_variable") return null;
  return (
    <NodeShell type="set_variable" selected={props.selected} title={<span>📝 Переменная</span>}>
      <div className="font-mono truncate">
        <span className="text-violet-700">{node.key}</span> ={" "}
        <span className="text-zinc-600">{node.value || '""'}</span>
      </div>
    </NodeShell>
  );
}

export const SetVariableNode = memo(SetVariableNodeRaw);
