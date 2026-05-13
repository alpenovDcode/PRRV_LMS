"use client";

// Standalone "actions" node — rare; usually used for macros without
// an adjacent message. The label on canvas summarises which atomic
// ops are configured so you can read intent at a glance.

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { NodeShell } from "./node-shell";
import type { FlowNode } from "@/lib/tg/flow-schema";
import { inlineActionsCount } from "@/lib/tg/flow-schema";

function summary(node: Extract<FlowNode, { type: "actions" }>): string {
  const a = node.actions;
  const parts: string[] = [];
  if (a.addTags?.length) parts.push(`+${a.addTags.join(", +")}`);
  if (a.removeTags?.length) parts.push(`−${a.removeTags.join(", −")}`);
  if (a.addToLists?.length) parts.push(`+${a.addToLists.length} списков`);
  if (a.removeFromLists?.length) parts.push(`−${a.removeFromLists.length} списков`);
  if (a.setVariables?.length) {
    for (const sv of a.setVariables) parts.push(`${sv.key}=…`);
  }
  return parts.join(" • ");
}

function ActionsNodeRaw(props: NodeProps) {
  const node = (props.data as { schemaNode?: FlowNode }).schemaNode;
  if (!node || node.type !== "actions") {
    return (
      <NodeShell type="actions" selected={props.selected} title={<span>🎯 Действия</span>}>
        <span className="text-zinc-400 italic">пусто</span>
      </NodeShell>
    );
  }
  const count = inlineActionsCount(node.actions);
  const text = summary(node);
  return (
    <NodeShell type="actions" selected={props.selected} title={<span>🎯 Действия ({count})</span>}>
      <div className="text-[11px] font-mono text-violet-700 line-clamp-2">
        {text || <span className="text-zinc-400 italic">пусто</span>}
      </div>
    </NodeShell>
  );
}

export const ActionsNode = memo(ActionsNodeRaw);
