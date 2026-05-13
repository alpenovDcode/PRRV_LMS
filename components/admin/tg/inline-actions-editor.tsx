"use client";

// Compact editor for an `InlineActions` bundle. Used as the
// "Действия после отправки" panel on message-node, "Действия после
// сохранения" on wait_reply, and "При клике" on individual buttons.
//
// Design: collapsible by default with a chip showing the action count,
// so the message-node form stays clean for users who don't need
// side-effects. Power users expand and configure tags/lists/variables
// inline — no need to drop a chain of helper nodes onto the canvas.

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Plus, ChevronDown, ChevronRight, Zap } from "lucide-react";
import {
  type InlineActions,
  type SetVariableAction,
  inlineActionsCount,
} from "@/lib/tg/flow-schema";

export interface InlineActionsEditorProps {
  value: InlineActions | undefined;
  onChange: (next: InlineActions | undefined) => void;
  // Label shown above the panel — context-dependent ("После отправки",
  // "После сохранения ответа", "При клике на кнопку").
  title?: string;
  // Whether to render in expanded state by default.
  defaultOpen?: boolean;
}

// Strip empty arrays from an InlineActions object before persisting —
// keeps the JSON minimal so flow-graph diffs are clean.
function normalize(a: InlineActions): InlineActions | undefined {
  const out: InlineActions = {};
  if (a.addTags && a.addTags.length > 0) out.addTags = a.addTags;
  if (a.removeTags && a.removeTags.length > 0) out.removeTags = a.removeTags;
  if (a.addToLists && a.addToLists.length > 0) out.addToLists = a.addToLists;
  if (a.removeFromLists && a.removeFromLists.length > 0)
    out.removeFromLists = a.removeFromLists;
  if (a.setVariables && a.setVariables.length > 0)
    out.setVariables = a.setVariables;
  return Object.keys(out).length === 0 ? undefined : out;
}

interface ListOption {
  id: string;
  name: string;
  icon: string | null;
}

export function InlineActionsEditor({
  value,
  onChange,
  title = "Действия",
  defaultOpen,
}: InlineActionsEditorProps) {
  const count = inlineActionsCount(value);
  const [open, setOpen] = useState(defaultOpen ?? count > 0);
  const v: InlineActions = value ?? {};

  // Fetch lists once so the user can pick by name instead of pasting ids.
  const params = useParams() as { botId?: string };
  const botId = params.botId ?? "";
  const [lists, setLists] = useState<ListOption[]>([]);
  useEffect(() => {
    if (!botId) return;
    fetch(`/api/admin/tg/bots/${botId}/lists`)
      .then((r) => r.json())
      .then((j) => setLists(j?.data?.lists ?? []))
      .catch(() => undefined);
  }, [botId]);

  const update = (patch: Partial<InlineActions>) => {
    const merged = { ...v, ...patch };
    onChange(normalize(merged));
  };

  return (
    <div className="border-t pt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between w-full text-left group"
      >
        <Label className="mb-0 flex items-center gap-2 cursor-pointer">
          <Zap className="h-3.5 w-3.5 text-amber-500" />
          {title}
          {count > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {count}
            </Badge>
          )}
        </Label>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
        )}
      </button>

      {open && (
        <div className="mt-2 space-y-3 bg-zinc-50/50 rounded p-2 border border-zinc-100">
          <TagListEditor
            label="Добавить теги"
            placeholder="например: registered"
            color="text-emerald-600"
            tags={v.addTags ?? []}
            onChange={(arr) => update({ addTags: arr })}
          />
          <TagListEditor
            label="Убрать теги"
            placeholder="например: cold"
            color="text-rose-600"
            tags={v.removeTags ?? []}
            onChange={(arr) => update({ removeTags: arr })}
          />
          <ListPickEditor
            label="Добавить в списки"
            color="text-teal-600"
            lists={lists}
            selectedIds={v.addToLists ?? []}
            onChange={(arr) => update({ addToLists: arr })}
          />
          <ListPickEditor
            label="Убрать из списков"
            color="text-amber-600"
            lists={lists}
            selectedIds={v.removeFromLists ?? []}
            onChange={(arr) => update({ removeFromLists: arr })}
          />
          <SetVariablesEditor
            variables={v.setVariables ?? []}
            onChange={(arr) => update({ setVariables: arr })}
          />
        </div>
      )}
    </div>
  );
}

// -- Sub-editors -----------------------------------------------------

function TagListEditor({
  label,
  placeholder,
  color,
  tags,
  onChange,
}: {
  label: string;
  placeholder: string;
  color: string;
  tags: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const t = draft.trim();
    if (!t) return;
    if (tags.includes(t)) return;
    onChange([...tags, t]);
    setDraft("");
  };
  return (
    <div>
      <Label className={`text-[11px] ${color} mb-1`}>{label}</Label>
      <div className="flex flex-wrap gap-1 mb-1">
        {tags.map((tag, idx) => (
          <Badge
            key={idx}
            variant="secondary"
            className={`pr-1 flex items-center gap-1 font-mono text-[10px] ${color}`}
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(tags.filter((_, i) => i !== idx))}
              className="hover:text-red-600"
            >
              ×
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-1">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="h-7 text-xs"
        />
        <Button size="sm" variant="outline" onClick={add} className="h-7">
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

function ListPickEditor({
  label,
  color,
  lists,
  selectedIds,
  onChange,
}: {
  label: string;
  color: string;
  lists: ListOption[];
  selectedIds: string[];
  onChange: (next: string[]) => void;
}) {
  const available = lists.filter((l) => !selectedIds.includes(l.id));
  return (
    <div>
      <Label className={`text-[11px] ${color} mb-1`}>{label}</Label>
      <div className="flex flex-wrap gap-1 mb-1">
        {selectedIds.length === 0 && (
          <span className="text-[10px] text-zinc-400 italic">—</span>
        )}
        {selectedIds.map((id) => {
          const meta = lists.find((l) => l.id === id);
          return (
            <Badge
              key={id}
              variant="secondary"
              className={`pr-1 flex items-center gap-1 ${color}`}
            >
              {meta?.icon ? `${meta.icon} ` : ""}
              {meta?.name ?? id.slice(0, 8)}
              <button
                type="button"
                onClick={() => onChange(selectedIds.filter((x) => x !== id))}
                className="hover:text-red-600"
              >
                ×
              </button>
            </Badge>
          );
        })}
      </div>
      {available.length > 0 && (
        <Select
          value=""
          onValueChange={(v) => onChange([...selectedIds, v])}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue placeholder="+ список" />
          </SelectTrigger>
          <SelectContent>
            {available.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.icon ? `${l.icon} ` : ""}
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

function SetVariablesEditor({
  variables,
  onChange,
}: {
  variables: SetVariableAction[];
  onChange: (next: SetVariableAction[]) => void;
}) {
  const add = () =>
    onChange([...variables, { key: "", value: "" }]);
  return (
    <div>
      <Label className="text-[11px] text-violet-600 mb-1">
        Установить переменные
      </Label>
      <div className="space-y-1">
        {variables.map((sv, idx) => (
          <div key={idx} className="flex gap-1 items-start">
            <Input
              value={sv.key}
              onChange={(e) => {
                const next = [...variables];
                next[idx] = { ...sv, key: e.target.value };
                onChange(next);
              }}
              placeholder="x / client.x / project.x"
              className="h-7 text-xs flex-1 font-mono"
            />
            <Input
              value={sv.value}
              onChange={(e) => {
                const next = [...variables];
                next[idx] = { ...sv, value: e.target.value };
                onChange(next);
              }}
              placeholder='значение или "{{question}}"'
              className="h-7 text-xs flex-1"
            />
            <button
              type="button"
              onClick={() => onChange(variables.filter((_, i) => i !== idx))}
              className="text-zinc-400 hover:text-red-600 mt-1"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
      <Button size="sm" variant="outline" onClick={add} className="h-7 mt-1">
        <Plus className="h-3 w-3 mr-1" /> переменная
      </Button>
    </div>
  );
}
