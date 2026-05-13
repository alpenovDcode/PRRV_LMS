"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { NodeShell } from "./node-shell";
import type { FlowNode } from "@/lib/tg/flow-schema";
import { inlineActionsCount } from "@/lib/tg/flow-schema";

function MessageNodeRaw(props: NodeProps) {
  const node = (props.data as { schemaNode: FlowNode }).schemaNode;
  if (node.type !== "message") return null;
  const firstLine = (node.payload.text ?? "").split("\n")[0]?.slice(0, 100) ?? "";
  const btnCount = (node.payload.buttonRows ?? []).reduce(
    (s, row) => s + row.length,
    0
  );
  const mediaCount =
    (node.payload.attachments?.length ?? 0) || (node.payload.photoUrl ? 1 : 0);
  // Iter 5 — show how many inline actions ride on this message so admins
  // can spot side-effects without opening the node.
  const actionCount = inlineActionsCount(node.payload.onSend);
  return (
    <NodeShell type="message" selected={props.selected} title={<span>💬 {node.label ?? "Сообщение"}</span>}>
      <div className="line-clamp-2 text-zinc-700">{firstLine || "—"}</div>
      <div className="flex items-center gap-2 text-[10px] text-zinc-400 mt-1">
        <span>{btnCount > 0 ? `${btnCount} кнопок` : "без кнопок"}</span>
        {mediaCount > 0 && <span>🖼 {mediaCount}</span>}
        {actionCount > 0 && (
          <span className="px-1 py-0.5 rounded bg-violet-100 text-violet-700 font-medium">
            ⚡ {actionCount}
          </span>
        )}
        {node.isPosition === false && (
          <span className="px-1 py-0.5 rounded bg-zinc-100 text-zinc-500" title="не-позиционная нода">
            фон
          </span>
        )}
      </div>
    </NodeShell>
  );
}

export const MessageNode = memo(MessageNodeRaw);
