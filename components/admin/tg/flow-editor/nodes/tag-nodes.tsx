"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { NodeShell } from "./node-shell";
import type { FlowNode } from "@/lib/tg/flow-schema";

function AddTagNodeRaw(props: NodeProps) {
  const node = (props.data as { schemaNode: FlowNode }).schemaNode;
  if (node.type !== "add_tag") return null;
  return (
    <NodeShell type="add_tag" selected={props.selected} title={<span>🏷️ + тег</span>}>
      <code className="text-cyan-700">{node.tag}</code>
    </NodeShell>
  );
}

function RemoveTagNodeRaw(props: NodeProps) {
  const node = (props.data as { schemaNode: FlowNode }).schemaNode;
  if (node.type !== "remove_tag") return null;
  return (
    <NodeShell type="remove_tag" selected={props.selected} title={<span>🏷️ − тег</span>}>
      <code className="text-cyan-700">{node.tag}</code>
    </NodeShell>
  );
}

export const AddTagNode = memo(AddTagNodeRaw);
export const RemoveTagNode = memo(RemoveTagNodeRaw);
