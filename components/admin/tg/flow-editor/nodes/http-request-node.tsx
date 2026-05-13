"use client";

import { memo } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { NodeShell } from "./node-shell";
import type { FlowNode } from "@/lib/tg/flow-schema";

function HttpRequestNodeRaw(props: NodeProps) {
  const node = (props.data as { schemaNode: FlowNode }).schemaNode;
  if (node.type !== "http_request") return null;
  return (
    <NodeShell
      type="http_request"
      selected={props.selected}
      title={<span>🌐 HTTP</span>}
      outputs={[
        { id: "ok", position: Position.Bottom, label: "ok" },
        { id: "error", position: Position.Right, label: "error", topOffset: "50%" },
      ]}
    >
      <div>
        <span className="font-mono text-[11px] px-1 rounded bg-lime-100 text-lime-800">
          {node.method}
        </span>{" "}
        <span className="truncate text-zinc-700 inline-block max-w-[170px] align-middle">
          {node.url}
        </span>
      </div>
      {node.saveAs && (
        <div className="text-[10px] text-zinc-400 mt-1">
          → vars.<code>{node.saveAs}</code>
        </div>
      )}
    </NodeShell>
  );
}

export const HttpRequestNode = memo(HttpRequestNodeRaw);
