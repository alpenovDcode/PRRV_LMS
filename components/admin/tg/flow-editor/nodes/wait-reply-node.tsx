"use client";

import { memo } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { NodeShell } from "./node-shell";
import { humanizeSeconds } from "./delay-node";
import type { FlowNode } from "@/lib/tg/flow-schema";
import { inlineActionsCount } from "@/lib/tg/flow-schema";

function WaitReplyNodeRaw(props: NodeProps) {
  const node = (props.data as { schemaNode: FlowNode }).schemaNode;
  if (node.type !== "wait_reply") return null;
  const actionCount = inlineActionsCount(node.onSave);
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
        в <code>{`{{${node.saveAs.startsWith("client.") || node.saveAs.includes(".") ? node.saveAs : `client.${node.saveAs}`}}}`}</code>
      </div>
      <div className="flex items-center gap-2 text-[10px] text-zinc-400 mt-1">
        <span>таймаут {humanizeSeconds(node.timeoutSeconds)}</span>
        {node.validation && <span>✓ regex</span>}
        {actionCount > 0 && (
          <span className="px-1 py-0.5 rounded bg-violet-100 text-violet-700 font-medium">
            ⚡ {actionCount}
          </span>
        )}
      </div>
    </NodeShell>
  );
}

export const WaitReplyNode = memo(WaitReplyNodeRaw);
