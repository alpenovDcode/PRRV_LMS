"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { NodeShell } from "./node-shell";
import type { FlowTrigger } from "@/lib/tg/flow-schema";

interface TriggerNodeData {
  triggers: FlowTrigger[];
  startNodeId: string;
}

function describeTrigger(t: FlowTrigger): string {
  switch (t.type) {
    case "command":
      return `/${t.command}${t.payloads?.length ? ` [${t.payloads.join(",")}]` : ""}`;
    case "keyword":
      return `«${t.keywords.slice(0, 2).join("», «")}»${t.keywords.length > 2 ? "…" : ""}`;
    case "regex":
      return `/${t.pattern}/i`;
    case "subscribed":
      return "новый подписчик";
  }
}

function TriggerNodeRaw(props: NodeProps) {
  const data = props.data as unknown as TriggerNodeData;
  const list = data.triggers ?? [];
  return (
    <NodeShell
      type="trigger"
      selected={props.selected}
      title={<span>▶ Триггер</span>}
      inputs={[]}
    >
      {list.length === 0 ? (
        <span className="text-zinc-400">нет триггеров — флоу можно запустить вручную</span>
      ) : (
        <ul className="space-y-0.5">
          {list.slice(0, 3).map((t, i) => (
            <li key={i} className="font-mono text-[11px] truncate">
              {describeTrigger(t)}
            </li>
          ))}
          {list.length > 3 && (
            <li className="text-zinc-400">+ ещё {list.length - 3}</li>
          )}
        </ul>
      )}
    </NodeShell>
  );
}

export const TriggerNode = memo(TriggerNodeRaw);
