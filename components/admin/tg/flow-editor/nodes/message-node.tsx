"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { NodeShell } from "./node-shell";
import type { FlowNode } from "@/lib/tg/flow-schema";

function MessageNodeRaw(props: NodeProps) {
  const node = (props.data as { schemaNode: FlowNode }).schemaNode;
  if (node.type !== "message") return null;
  const firstLine = (node.payload.text ?? "").split("\n")[0]?.slice(0, 100) ?? "";
  const btnCount = (node.payload.buttonRows ?? []).reduce(
    (s, row) => s + row.length,
    0
  );
  return (
    <NodeShell type="message" selected={props.selected} title={<span>💬 {node.label ?? "Сообщение"}</span>}>
      <div className="line-clamp-2 text-zinc-700">{firstLine || "—"}</div>
      <div className="text-[10px] text-zinc-400 mt-1">
        {btnCount > 0 ? `${btnCount} кнопок` : "без кнопок"}
        {node.payload.photoUrl && <span> · 🖼</span>}
      </div>
    </NodeShell>
  );
}

export const MessageNode = memo(MessageNodeRaw);
