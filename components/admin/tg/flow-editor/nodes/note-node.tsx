"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { NodeShell } from "./node-shell";
import type { FlowNode } from "@/lib/tg/flow-schema";

// Note node — pure editor annotation, never sends anything to the
// subscriber. Engine just walks past it. Styled like a sticky note so
// it's visually distinct from action nodes at a glance.
function NoteNodeRaw(props: NodeProps) {
  const node = (props.data as { schemaNode?: FlowNode }).schemaNode;
  const text =
    node && node.type === "note" ? node.text ?? "" : "";
  return (
    <NodeShell
      type="note"
      selected={props.selected}
      title={<span>💭 Заметка</span>}
    >
      <div className="text-yellow-900/80 italic whitespace-pre-wrap line-clamp-4">
        {text || "Кликни, чтобы добавить заметку…"}
      </div>
    </NodeShell>
  );
}

export const NoteNode = memo(NoteNodeRaw);
