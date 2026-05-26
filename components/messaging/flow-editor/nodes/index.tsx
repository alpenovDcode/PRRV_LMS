"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  MessageSquare,
  ListChecks,
  ExternalLink,
  Clock,
  GitBranch,
  Variable,
  CircleStop,
  Play,
} from "lucide-react";

/** Базовая обёртка для всех узлов — иконка, заголовок, контент, handles. */
function NodeShell({
  isStart,
  icon: Icon,
  title,
  color,
  children,
  hasTarget = true,
  selected,
}: {
  isStart?: boolean;
  icon: any;
  title: string;
  color: string;
  children?: React.ReactNode;
  hasTarget?: boolean;
  selected?: boolean;
}) {
  return (
    <div
      className={`bg-white rounded-xl shadow-sm border-2 transition-all min-w-[200px] max-w-[280px] ${
        selected ? "border-blue-500 shadow-lg" : "border-gray-200 hover:border-gray-300"
      }`}
    >
      {hasTarget && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-2.5 !h-2.5 !bg-gray-400 !border-2 !border-white"
        />
      )}
      <div className={`flex items-center gap-2 px-3 py-2 border-b border-gray-100 ${color}`}>
        <Icon className="w-4 h-4" />
        <span className="text-xs font-semibold flex-1">{title}</span>
        {isStart && (
          <span className="flex items-center gap-1 text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold">
            <Play className="w-2.5 h-2.5" /> START
          </span>
        )}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

/** Source handle с подписью справа */
function SourceHandle({
  id,
  topPercent,
  label,
  color = "#9ca3af",
}: {
  id: string;
  topPercent: number;
  label?: string;
  color?: string;
}) {
  return (
    <>
      <Handle
        type="source"
        position={Position.Right}
        id={id}
        style={{
          top: `${topPercent}%`,
          width: 10,
          height: 10,
          background: color,
          border: "2px solid white",
        }}
      />
      {label && (
        <span
          className="absolute right-[-58px] text-[10px] text-gray-500 whitespace-nowrap pointer-events-none"
          style={{ top: `calc(${topPercent}% - 6px)` }}
        >
          {label}
        </span>
      )}
    </>
  );
}

// ─── Узлы ──────────────────────────────────────────────────────────────────

export function SendTextNode({ data, selected }: NodeProps) {
  const d = data as any;
  return (
    <NodeShell
      isStart={d.isStart}
      icon={MessageSquare}
      title="Отправить текст"
      color="bg-blue-50 text-blue-700"
      selected={selected}
    >
      <p className="text-xs text-gray-700 line-clamp-3 whitespace-pre-wrap break-words">
        {d.text || <span className="italic text-gray-400">Текст не задан</span>}
      </p>
      <SourceHandle id="next" topPercent={70} />
    </NodeShell>
  );
}

export function SendQuickRepliesNode({ data, selected }: NodeProps) {
  const d = data as any;
  return (
    <NodeShell
      isStart={d.isStart}
      icon={ListChecks}
      title="Quick Replies"
      color="bg-violet-50 text-violet-700"
      selected={selected}
    >
      <p className="text-xs text-gray-700 line-clamp-2 mb-2">
        {d.text || <span className="italic text-gray-400">Текст не задан</span>}
      </p>
      <div className="flex flex-wrap gap-1">
        {(d.buttons ?? []).slice(0, 6).map((b: any, i: number) => (
          <span key={i} className="text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded">
            {b.title}
          </span>
        ))}
        {d.buttons?.length > 6 && (
          <span className="text-[10px] text-gray-400">+{d.buttons.length - 6}</span>
        )}
      </div>
      <SourceHandle id="next" topPercent={70} />
    </NodeShell>
  );
}

export function SendButtonsNode({ data, selected }: NodeProps) {
  const d = data as any;
  return (
    <NodeShell
      isStart={d.isStart}
      icon={ExternalLink}
      title="Кнопки (URL/postback)"
      color="bg-pink-50 text-pink-700"
      selected={selected}
    >
      <p className="text-xs text-gray-700 line-clamp-2 mb-2">
        {d.text || <span className="italic text-gray-400">Текст не задан</span>}
      </p>
      <div className="flex flex-col gap-1">
        {(d.buttons ?? []).slice(0, 3).map((b: any, i: number) => (
          <div key={i} className="flex items-center gap-1 text-[10px] bg-pink-100 text-pink-700 px-1.5 py-0.5 rounded">
            {b.type === "url" ? <ExternalLink className="w-2.5 h-2.5" /> : <MessageSquare className="w-2.5 h-2.5" />}
            <span className="truncate max-w-[180px]">{b.title}</span>
          </div>
        ))}
      </div>
      <SourceHandle id="next" topPercent={70} />
    </NodeShell>
  );
}

export function WaitReplyNode({ data, selected }: NodeProps) {
  const d = data as any;
  const hours = Math.round((d.timeoutSec ?? 86400) / 3600);
  return (
    <NodeShell
      isStart={d.isStart}
      icon={Clock}
      title="Ждать ответ"
      color="bg-amber-50 text-amber-700"
      selected={selected}
    >
      <p className="text-xs text-gray-600">
        Timeout: <strong>{hours}ч</strong>
      </p>
      <SourceHandle id="onReply" topPercent={40} label="ответил" color="#10b981" />
      <SourceHandle id="onTimeout" topPercent={75} label="timeout" color="#f59e0b" />
    </NodeShell>
  );
}

export function ConditionNode({ data, selected }: NodeProps) {
  const d = data as any;
  const branches = d.branches ?? [];
  return (
    <NodeShell
      isStart={d.isStart}
      icon={GitBranch}
      title="Условие"
      color="bg-indigo-50 text-indigo-700"
      selected={selected}
    >
      <div className="space-y-1 mb-1">
        {branches.length === 0 && (
          <p className="text-xs italic text-gray-400">Нет веток</p>
        )}
        {branches.map((br: any, i: number) => (
          <div key={i} className="text-[10px] text-gray-700">
            <span className="text-indigo-600 font-mono">{br.field}</span>{" "}
            <span className="text-gray-400">{br.match}</span>{" "}
            <span className="bg-gray-100 px-1 rounded">{br.value || "?"}</span>
          </div>
        ))}
        <p className="text-[10px] text-gray-400">иначе →</p>
      </div>
      {branches.map((_: any, i: number) => {
        const topPercent = 30 + i * 12;
        return (
          <SourceHandle
            key={i}
            id={`branch-${i}`}
            topPercent={topPercent}
            label={`#${i + 1}`}
            color="#6366f1"
          />
        );
      })}
      <SourceHandle id="onNoMatch" topPercent={85} label="иначе" color="#94a3b8" />
    </NodeShell>
  );
}

export function SetVariableNode({ data, selected }: NodeProps) {
  const d = data as any;
  return (
    <NodeShell
      isStart={d.isStart}
      icon={Variable}
      title="Записать переменную"
      color="bg-teal-50 text-teal-700"
      selected={selected}
    >
      <p className="text-xs text-gray-700">
        <code className="bg-teal-100 text-teal-700 px-1 rounded">{d.key || "key"}</code>
        {" = "}
        <span className="text-gray-500">{d.value ?? ""}</span>
      </p>
      <SourceHandle id="next" topPercent={70} />
    </NodeShell>
  );
}

export function EndNode({ data, selected }: NodeProps) {
  const d = data as any;
  return (
    <NodeShell
      isStart={d.isStart}
      icon={CircleStop}
      title="Конец"
      color="bg-gray-50 text-gray-700"
      selected={selected}
    />
  );
}

// ─── Реестр типов узлов для React Flow ─────────────────────────────────────

export const nodeTypes = {
  send_text: SendTextNode,
  send_quick_replies: SendQuickRepliesNode,
  send_buttons: SendButtonsNode,
  wait_reply: WaitReplyNode,
  condition: ConditionNode,
  set_variable: SetVariableNode,
  end: EndNode,
};

// ─── Конфигурация типов для палитры ────────────────────────────────────────

export interface NodeTypeConfig {
  type: string;
  label: string;
  icon: any;
  colorClass: string;
  /** Default-данные при создании узла */
  defaults: () => Record<string, unknown>;
}

export const NODE_TYPE_CONFIGS: NodeTypeConfig[] = [
  {
    type: "send_text",
    label: "Отправить текст",
    icon: MessageSquare,
    colorClass: "bg-blue-50 text-blue-700 border-blue-200",
    defaults: () => ({ type: "send_text", text: "Привет!", next: null }),
  },
  {
    type: "send_quick_replies",
    label: "Quick Replies",
    icon: ListChecks,
    colorClass: "bg-violet-50 text-violet-700 border-violet-200",
    defaults: () => ({
      type: "send_quick_replies",
      text: "Выбери вариант:",
      buttons: [{ title: "Вариант 1", payload: "OPT_1" }],
      next: null,
    }),
  },
  {
    type: "send_buttons",
    label: "Кнопки (URL/postback)",
    icon: ExternalLink,
    colorClass: "bg-pink-50 text-pink-700 border-pink-200",
    defaults: () => ({
      type: "send_buttons",
      text: "Узнай больше:",
      buttons: [{ type: "url", title: "Открыть", url: "https://prrv.tech" }],
      next: null,
    }),
  },
  {
    type: "wait_reply",
    label: "Ждать ответ",
    icon: Clock,
    colorClass: "bg-amber-50 text-amber-700 border-amber-200",
    defaults: () => ({ type: "wait_reply", timeoutSec: 86400, onReply: null, onTimeout: null }),
  },
  {
    type: "condition",
    label: "Условие",
    icon: GitBranch,
    colorClass: "bg-indigo-50 text-indigo-700 border-indigo-200",
    defaults: () => ({
      type: "condition",
      branches: [{ field: "lastInput", match: "contains", value: "да", next: null }],
      onNoMatch: null,
    }),
  },
  {
    type: "set_variable",
    label: "Записать переменную",
    icon: Variable,
    colorClass: "bg-teal-50 text-teal-700 border-teal-200",
    defaults: () => ({ type: "set_variable", key: "var", value: "", next: null }),
  },
  {
    type: "end",
    label: "Конец",
    icon: CircleStop,
    colorClass: "bg-gray-50 text-gray-700 border-gray-200",
    defaults: () => ({ type: "end" }),
  },
];
