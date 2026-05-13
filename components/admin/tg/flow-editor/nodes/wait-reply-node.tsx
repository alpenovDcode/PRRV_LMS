"use client";

import { memo } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { NodeShell } from "./node-shell";
import { humanizeSeconds } from "./delay-node";
import type { FlowNode } from "@/lib/tg/flow-schema";

function WaitReplyNodeRaw(props: NodeProps) {
  const node = (props.data as { schemaNode: FlowNode }).schemaNode;
  if (node.type !== "wait_reply") return null;
  return (
    <NodeShell
      type="wait_reply"
      selected={props.selected}
      title={<span>⌛ {node.label ?? "Ждать ответ"}</span>}
      outputs={[
        { id: "reply", position: Position.Right, label: "ответ", topOffset: "50%" },
        { id: "timeout", position: Position.Bottom, label: "таймаут" },
      ]}
    >
      <div>
        в <code>{`{{vars.${node.saveAs}}}`}</code>
      </div>
      <div className="text-[10px] text-zinc-400 mt-1">
        таймаут {humanizeSeconds(node.timeoutSeconds)}
      </div>
    </NodeShell>
  );
}

export const WaitReplyNode = memo(WaitReplyNodeRaw);
