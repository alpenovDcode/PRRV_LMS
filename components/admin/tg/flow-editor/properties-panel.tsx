"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus } from "lucide-react";
import type {
  FlowButton,
  FlowNode,
  FlowTrigger,
  FlowMessagePayload,
  MediaAttachment,
} from "@/lib/tg/flow-schema";
import { TRIGGER_NODE_ID } from "@/lib/tg/flow-editor-converter";
import { MediaAttachmentsEditor } from "@/components/admin/tg/media-picker";

// ============================================================================
// Generic helpers
// ============================================================================

type DurationUnit = "s" | "m" | "h" | "d";

function splitDuration(totalSeconds: number): { value: number; unit: DurationUnit } {
  if (totalSeconds >= 86400 && totalSeconds % 86400 === 0) {
    return { value: totalSeconds / 86400, unit: "d" };
  }
  if (totalSeconds >= 3600 && totalSeconds % 3600 === 0) {
    return { value: totalSeconds / 3600, unit: "h" };
  }
  if (totalSeconds >= 60 && totalSeconds % 60 === 0) {
    return { value: totalSeconds / 60, unit: "m" };
  }
  return { value: totalSeconds, unit: "s" };
}

function toSeconds(value: number, unit: DurationUnit): number {
  if (unit === "d") return value * 86400;
  if (unit === "h") return value * 3600;
  if (unit === "m") return value * 60;
  return value;
}

function DurationInput({
  totalSeconds,
  onChange,
  max,
}: {
  totalSeconds: number;
  onChange: (s: number) => void;
  max?: number;
}) {
  const { value, unit } = splitDuration(totalSeconds);
  return (
    <div className="flex gap-2">
      <Input
        type="number"
        min={1}
        max={max}
        value={value}
        onChange={(e) => {
          const v = Math.max(1, parseInt(e.target.value || "0", 10) || 1);
          onChange(toSeconds(v, unit));
        }}
        className="flex-1"
      />
      <Select
        value={unit}
        onValueChange={(u: string) => onChange(toSeconds(value, u as DurationUnit))}
      >
        <SelectTrigger className="w-24">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="s">сек</SelectItem>
          <SelectItem value="m">мин</SelectItem>
          <SelectItem value="h">час</SelectItem>
          <SelectItem value="d">дн</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

interface NodeOption {
  id: string;
  label: string;
}

function NodePicker({
  value,
  onChange,
  options,
  placeholder = "— не выбрано —",
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  options: NodeOption[];
  placeholder?: string;
}) {
  return (
    <Select
      value={value ?? "__none__"}
      onValueChange={(v) => onChange(v === "__none__" ? undefined : v)}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">— не выбрано —</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Toggle for the "Step / Side-effect" distinction on message nodes.
// Step = isPosition=true (default): subscriber's position pointer
// updates here, and any pending dozhims from previous Steps cancel.
// Side-effect = isPosition=false: fire-and-forget, position stays put.
function PositionToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="border-t pt-3 mt-3">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <Label className="mb-0 flex items-center gap-2">
            <span>«Шаг» воронки</span>
            <Badge variant={value ? "default" : "secondary"} className="text-[10px]">
              {value ? "позиция" : "фон"}
            </Badge>
          </Label>
          <p className="text-[10px] text-zinc-500 mt-1">
            {value
              ? "Подписчик «остановится» в этой ноде. Дожимы из предыдущей позиции отменятся."
              : "Сработает рядом с активным шагом. Позицию не сдвинет, дожимы не отменит."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChange(!value)}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
            value ? "bg-blue-600" : "bg-zinc-300"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
              value ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
      </div>
    </div>
  );
}

// Regex validation editor for wait_reply nodes. Pulls presets from
// regex-presets.ts so the user can drop in a phone/email/date pattern
// in one click — no regex memorisation.
import { REGEX_PRESETS } from "@/lib/tg/regex-presets";

interface ValidationValue {
  pattern: string;
  flags?: string;
  errorMessage?: string;
  onInvalidNext?: string;
  maxAttempts?: number;
}

function ValidationEditor({
  value,
  onChange,
}: {
  value: ValidationValue | undefined;
  onChange: (v: ValidationValue | undefined) => void;
}) {
  const enabled = Boolean(value);
  return (
    <div className="border-t pt-3">
      <div className="flex items-center justify-between mb-2">
        <Label className="mb-0">Проверка ответа</Label>
        <button
          type="button"
          onClick={() =>
            onChange(enabled ? undefined : { pattern: "" })
          }
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
            enabled ? "bg-blue-600" : "bg-zinc-300"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
              enabled ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
      </div>
      {enabled && value && (
        <div className="space-y-2">
          <div>
            <Label className="text-[10px]">Шаблон (regex)</Label>
            <Input
              value={value.pattern}
              onChange={(e) => onChange({ ...value, pattern: e.target.value })}
              className="font-mono text-xs"
              placeholder="например, ^\\d{11}$"
            />
          </div>
          <div>
            <Label className="text-[10px]">Готовые шаблоны</Label>
            <Select
              value=""
              onValueChange={(key) => {
                const p = REGEX_PRESETS.find((x) => x.key === key);
                if (p) onChange({ ...value, pattern: p.pattern });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="выбрать пресет…" />
              </SelectTrigger>
              <SelectContent>
                {REGEX_PRESETS.map((p) => (
                  <SelectItem key={p.key} value={p.key}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px]">Сообщение при ошибке</Label>
            <Input
              value={value.errorMessage ?? ""}
              onChange={(e) =>
                onChange({ ...value, errorMessage: e.target.value || undefined })
              }
              placeholder="Например: «Введите номер в формате +79991234567»"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Fetches the bot's lists once and lets the user pick one. Used by
// add_to_list / remove_from_list nodes. We pull botId from the URL —
// the editor is always rendered under /admin/bots/[botId].
function ListPicker({
  listId,
  onChange,
}: {
  listId: string;
  onChange: (id: string) => void;
}) {
  const params = useParams() as { botId?: string };
  const botId = params.botId ?? "";
  const [lists, setLists] = useState<Array<{ id: string; name: string; icon: string | null }>>([]);
  useEffect(() => {
    if (!botId) return;
    fetch(`/api/admin/tg/bots/${botId}/lists`)
      .then((r) => r.json())
      .then((j) => setLists(j?.data?.lists ?? []))
      .catch(() => undefined);
  }, [botId]);
  return (
    <div>
      <Label>Список</Label>
      <Select value={listId || "__none__"} onValueChange={(v) => onChange(v === "__none__" ? "" : v)}>
        <SelectTrigger>
          <SelectValue placeholder="— выбрать —" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— не выбран —</SelectItem>
          {lists.map((l) => (
            <SelectItem key={l.id} value={l.id}>
              {l.icon ? `${l.icon} ` : ""}
              {l.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {lists.length === 0 && (
        <p className="text-[10px] text-zinc-500 mt-1">
          Ни одного списка. Создай в разделе «Списки».
        </p>
      )}
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

interface FlowListItem {
  id: string;
  name: string;
}

export interface PropertiesPanelProps {
  selectedNodeId: string | null;
  nodes: Array<{ id: string; type: string; data: unknown }>;
  flowList: FlowListItem[];
  currentFlowId: string;
  onUpdateNode: (id: string, data: unknown) => void;
  onUpdateTriggers: (triggers: FlowTrigger[]) => void;
  onDeleteNode: (id: string) => void;
}

export function PropertiesPanel({
  selectedNodeId,
  nodes,
  flowList,
  currentFlowId,
  onUpdateNode,
  onUpdateTriggers,
  onDeleteNode,
}: PropertiesPanelProps) {
  const selected = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  );

  // Options for "next-node" pickers: all schema nodes except the current one.
  const nodeOptions = useMemo<NodeOption[]>(() => {
    return nodes
      .filter((n) => n.id !== TRIGGER_NODE_ID && n.id !== selectedNodeId)
      .map((n) => {
        const data = n.data as { schemaNode?: FlowNode };
        const label = data.schemaNode?.label ?? n.id;
        return { id: n.id, label: `${label} (${n.type})` };
      });
  }, [nodes, selectedNodeId]);

  if (!selected) {
    return (
      <aside className="w-80 shrink-0 border-l bg-white p-4 text-sm text-zinc-500">
        <div className="font-semibold text-zinc-700 mb-2">Свойства</div>
        Выберите ноду на холсте, чтобы редактировать её параметры.
      </aside>
    );
  }

  // -- Trigger virtual node ----------
  if (selected.id === TRIGGER_NODE_ID) {
    const triggers =
      (selected.data as { triggers?: FlowTrigger[] }).triggers ?? [];
    return (
      <aside className="w-80 shrink-0 border-l bg-white p-4 overflow-y-auto space-y-3">
        <div className="font-semibold text-zinc-800">Триггеры запуска</div>
        <p className="text-xs text-zinc-500">
          Когда любое из этих условий выполняется — запускается сценарий.
        </p>
        <TriggersEditor triggers={triggers} onChange={onUpdateTriggers} />
      </aside>
    );
  }

  const sNode = (selected.data as { schemaNode?: FlowNode }).schemaNode;
  if (!sNode) {
    return (
      <aside className="w-80 shrink-0 border-l bg-white p-4 text-sm text-zinc-500">
        Нет данных
      </aside>
    );
  }

  const update = (patch: Partial<FlowNode>) => {
    const data = selected.data as Record<string, unknown>;
    const merged = {
      ...(sNode as unknown as Record<string, unknown>),
      ...(patch as unknown as Record<string, unknown>),
    };
    onUpdateNode(selected.id, { ...data, schemaNode: merged });
  };

  return (
    <aside className="w-80 shrink-0 border-l bg-white p-4 overflow-y-auto space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold text-zinc-800">Свойства ноды</div>
          <Badge variant="secondary" className="mt-1 font-mono text-[10px]">
            {sNode.type}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDeleteNode(selected.id)}
          title="Удалить ноду"
        >
          <Trash2 className="h-4 w-4 text-red-500" />
        </Button>
      </div>

      <div>
        <Label>ID</Label>
        <Input
          value={sNode.id}
          onChange={(e) => update({ id: e.target.value.replace(/\s+/g, "-") } as Partial<FlowNode>)}
        />
      </div>
      <div>
        <Label>Подпись</Label>
        <Input
          value={sNode.label ?? ""}
          onChange={(e) => update({ label: e.target.value } as Partial<FlowNode>)}
        />
      </div>

      {sNode.type === "message" && (
        <>
          <MessageEditor
            payload={sNode.payload}
            onChange={(p) => update({ payload: p } as Partial<FlowNode>)}
            nodeOptions={nodeOptions}
          />
          <PositionToggle
            value={sNode.isPosition !== false}
            onChange={(v) =>
              update({ isPosition: v } as Partial<FlowNode>)
            }
          />
        </>
      )}

      {sNode.type === "delay" && (
        <div>
          <Label>Длительность</Label>
          <DurationInput
            totalSeconds={sNode.seconds}
            onChange={(s) => update({ seconds: s } as Partial<FlowNode>)}
            max={60 * 60 * 24 * 90}
          />
          <p className="text-[10px] text-zinc-500 mt-1">
            Если за это время пользователь дойдёт до новой «позиции» — этот дожим отменится автоматически.
          </p>
        </div>
      )}

      {sNode.type === "wait_reply" && (
        <>
          <div>
            <Label>Сохранить ответ в</Label>
            <Input
              value={sNode.saveAs}
              onChange={(e) => update({ saveAs: e.target.value } as Partial<FlowNode>)}
              placeholder="answer или client.x, project.x, field.x"
            />
            <p className="text-[10px] text-zinc-500 mt-1">
              По умолчанию пишется в <code>client.&lt;ключ&gt;</code>. Префикс{" "}
              <code>project.</code> — в переменные проекта, <code>field.</code> — в кастомное поле.
            </p>
          </div>
          <div>
            <Label>Таймаут</Label>
            <DurationInput
              totalSeconds={sNode.timeoutSeconds}
              onChange={(s) => update({ timeoutSeconds: s } as Partial<FlowNode>)}
              max={60 * 60 * 24 * 7}
            />
          </div>
          <ValidationEditor
            value={sNode.validation}
            onChange={(v) =>
              update({ validation: v } as Partial<FlowNode>)
            }
          />
          <div className="text-[11px] text-zinc-500 pt-2 border-t">
            Связи: «ответ» и «таймаут» — тяните рёбра от соответствующих handle’ов на холсте.
          </div>
        </>
      )}

      {sNode.type === "condition" && (
        <ConditionEditor
          rules={sNode.rules}
          onChange={(rules) => update({ rules } as Partial<FlowNode>)}
        />
      )}

      {sNode.type === "add_tag" && (
        <div>
          <Label>Тег</Label>
          <Input
            value={sNode.tag}
            onChange={(e) => update({ tag: e.target.value } as Partial<FlowNode>)}
            placeholder="например, warm"
          />
        </div>
      )}
      {sNode.type === "remove_tag" && (
        <div>
          <Label>Тег</Label>
          <Input
            value={sNode.tag}
            onChange={(e) => update({ tag: e.target.value } as Partial<FlowNode>)}
            placeholder="например, cold"
          />
        </div>
      )}

      {(sNode.type === "add_to_list" || sNode.type === "remove_from_list") && (
        <ListPicker
          listId={sNode.listId}
          onChange={(id) => update({ listId: id } as Partial<FlowNode>)}
        />
      )}

      {sNode.type === "set_variable" && (
        <>
          <div>
            <Label>Ключ переменной</Label>
            <Input
              value={sNode.key}
              onChange={(e) => update({ key: e.target.value } as Partial<FlowNode>)}
              placeholder="например: x  /  client.x  /  project.x  /  field.x"
            />
            <p className="text-[10px] text-zinc-500 mt-1">
              Без префикса = переменная подписчика (client). Префиксы:{" "}
              <code>project.</code> (бот), <code>deal.</code> (этот run),{" "}
              <code>field.</code> (кастомное поле).
            </p>
          </div>
          <div>
            <Label>Значение</Label>
            <Textarea
              rows={3}
              value={sNode.value}
              onChange={(e) => update({ value: e.target.value } as Partial<FlowNode>)}
              placeholder='Текст или шаблон. Пример: {{addDays(current_date, 3)}}'
            />
            <div className="flex items-center gap-2 mt-1">
              <input
                type="checkbox"
                id={`expr-${sNode.id}`}
                checked={sNode.asExpression === true}
                onChange={(e) =>
                  update({ asExpression: e.target.checked } as Partial<FlowNode>)
                }
              />
              <Label htmlFor={`expr-${sNode.id}`} className="mb-0 text-[11px] font-normal">
                Считать как выражение (число/массив/булево, без шаблонизации)
              </Label>
            </div>
            <p className="text-[10px] text-zinc-500 mt-1">
              Доступно: <code>{`{{client.x}}`}</code>, <code>{`{{addDays(...)}}`}</code>,{" "}
              <code>{`{{date_rus(current_date)}}`}</code>, <code>{`{{normalizePhone(question)}}`}</code> и др.
            </p>
          </div>
        </>
      )}

      {sNode.type === "note" && (
        <div>
          <Label>Текст заметки</Label>
          <Textarea
            rows={4}
            value={sNode.text ?? ""}
            onChange={(e) => update({ text: e.target.value } as Partial<FlowNode>)}
            placeholder="Любое описание для редактора — игнорируется движком"
          />
        </div>
      )}

      {sNode.type === "http_request" && (
        <HttpRequestEditor
          node={sNode}
          onChange={(patch) => update(patch as Partial<FlowNode>)}
        />
      )}

      {sNode.type === "goto_flow" && (
        <GotoFlowEditor
          flowId={sNode.flowId}
          flowList={flowList}
          currentFlowId={currentFlowId}
          onChange={(id) => update({ flowId: id } as Partial<FlowNode>)}
        />
      )}

      {sNode.type === "end" && (
        <div className="text-sm text-zinc-500 p-3 bg-zinc-50 rounded border border-zinc-200">
          Терминальная нода — никакой настройки.
        </div>
      )}
    </aside>
  );
}

// ============================================================================
// Sub-editors
// ============================================================================

function MessageEditor({
  payload,
  onChange,
  nodeOptions,
}: {
  payload: FlowMessagePayload;
  onChange: (p: FlowMessagePayload) => void;
  nodeOptions: NodeOption[];
}) {
  const buttonRows = payload.buttonRows ?? [];

  const setButton = (rowIdx: number, btnIdx: number, btn: FlowButton) => {
    const next = buttonRows.map((row, ri) =>
      ri === rowIdx ? row.map((b, bi) => (bi === btnIdx ? btn : b)) : row
    );
    onChange({ ...payload, buttonRows: next });
  };
  const addButton = (rowIdx: number) => {
    const next = buttonRows.map((row, ri) =>
      ri === rowIdx ? [...row, { text: "Кнопка" } as FlowButton] : row
    );
    onChange({ ...payload, buttonRows: next });
  };
  const removeButton = (rowIdx: number, btnIdx: number) => {
    const next = buttonRows
      .map((row, ri) => (ri === rowIdx ? row.filter((_, bi) => bi !== btnIdx) : row))
      .filter((row) => row.length > 0);
    onChange({ ...payload, buttonRows: next.length ? next : undefined });
  };
  const addRow = () => {
    onChange({
      ...payload,
      buttonRows: [...buttonRows, [{ text: "Кнопка" } as FlowButton]],
    });
  };

  return (
    <>
      <div>
        <Label>Текст</Label>
        <Textarea
          rows={5}
          value={payload.text}
          onChange={(e) => onChange({ ...payload, text: e.target.value })}
        />
        <div className="text-[10px] text-zinc-500 mt-1">
          Поддерживает <code>{`{{user.first_name}}`}</code>, теги{" "}
          <code>&lt;b&gt;</code>, <code>&lt;i&gt;</code>, <code>&lt;a&gt;</code>.
        </div>
      </div>
      <MediaAttachmentsEditor
        attachments={payload.attachments ?? []}
        legacyPhotoUrl={payload.photoUrl}
        onChange={(next) =>
          onChange({
            ...payload,
            attachments: next,
            // First time the user opens the picker, migrate the legacy
            // photoUrl into the new list and clear the old field.
            photoUrl: undefined,
          })
        }
      />
      <div className="border-t pt-3">
        <div className="flex items-center justify-between mb-2">
          <Label className="mb-0">Кнопки</Label>
          <Button variant="outline" size="sm" onClick={addRow}>
            <Plus className="h-3 w-3" /> ряд
          </Button>
        </div>
        <div className="space-y-3">
          {buttonRows.map((row, rowIdx) => (
            <div
              key={rowIdx}
              className="border border-zinc-200 rounded p-2 space-y-2 bg-zinc-50/50"
            >
              <div className="text-[10px] text-zinc-500 flex justify-between">
                <span>Ряд {rowIdx + 1}</span>
                <button
                  type="button"
                  className="text-purple-600 hover:underline"
                  onClick={() => addButton(rowIdx)}
                >
                  + кнопка
                </button>
              </div>
              {row.map((btn, btnIdx) => (
                <ButtonEditor
                  key={btnIdx}
                  button={btn}
                  onChange={(b) => setButton(rowIdx, btnIdx, b)}
                  onRemove={() => removeButton(rowIdx, btnIdx)}
                  nodeOptions={nodeOptions}
                />
              ))}
            </div>
          ))}
          {buttonRows.length === 0 && (
            <div className="text-xs text-zinc-400 italic">Без кнопок</div>
          )}
        </div>
      </div>
    </>
  );
}

type ButtonKind = "url" | "callback";

function ButtonEditor({
  button,
  onChange,
  onRemove,
  nodeOptions,
}: {
  button: FlowButton;
  onChange: (b: FlowButton) => void;
  onRemove: () => void;
  nodeOptions: NodeOption[];
}) {
  const kind: ButtonKind = button.url ? "url" : "callback";
  // Callback shortcuts.
  const callback = button.callback ?? "";
  const cbKind: "goto" | "tag_add" | "tag_rm" | "custom" = callback.startsWith("goto:")
    ? "goto"
    : callback.startsWith("tag:add:")
    ? "tag_add"
    : callback.startsWith("tag:rm:")
    ? "tag_rm"
    : "custom";

  return (
    <div className="border border-zinc-200 rounded bg-white p-2 space-y-2">
      <div className="flex gap-2">
        <Input
          className="flex-1"
          value={button.text}
          onChange={(e) => onChange({ ...button, text: e.target.value })}
          placeholder="Текст кнопки"
        />
        <Button variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 className="h-3 w-3 text-red-500" />
        </Button>
      </div>
      <Select
        value={kind}
        onValueChange={(v) => {
          if (v === "url")
            onChange({ ...button, url: button.url ?? "https://", callback: undefined });
          else onChange({ ...button, url: undefined, callback: button.callback ?? "" });
        }}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="url">URL-кнопка</SelectItem>
          <SelectItem value="callback">Callback</SelectItem>
        </SelectContent>
      </Select>
      {kind === "url" && (
        <Input
          value={button.url ?? ""}
          onChange={(e) => onChange({ ...button, url: e.target.value })}
          placeholder="https://…"
        />
      )}
      {kind === "callback" && (
        <>
          <Select
            value={cbKind}
            onValueChange={(v) => {
              if (v === "goto") onChange({ ...button, callback: "goto:" });
              else if (v === "tag_add") onChange({ ...button, callback: "tag:add:" });
              else if (v === "tag_rm") onChange({ ...button, callback: "tag:rm:" });
              else onChange({ ...button, callback: "" });
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="goto">↪ Перейти к флоу</SelectItem>
              <SelectItem value="tag_add">+ установить тег</SelectItem>
              <SelectItem value="tag_rm">− снять тег</SelectItem>
              <SelectItem value="custom">кастомная строка</SelectItem>
            </SelectContent>
          </Select>
          {cbKind === "tag_add" && (
            <Input
              value={callback.slice("tag:add:".length)}
              onChange={(e) => onChange({ ...button, callback: `tag:add:${e.target.value}` })}
              placeholder="имя тега"
            />
          )}
          {cbKind === "tag_rm" && (
            <Input
              value={callback.slice("tag:rm:".length)}
              onChange={(e) => onChange({ ...button, callback: `tag:rm:${e.target.value}` })}
              placeholder="имя тега"
            />
          )}
          {cbKind === "goto" && (
            <Input
              value={callback.slice("goto:".length)}
              onChange={(e) => onChange({ ...button, callback: `goto:${e.target.value}` })}
              placeholder="flowId"
            />
          )}
          {cbKind === "custom" && (
            <Input
              value={callback}
              onChange={(e) => onChange({ ...button, callback: e.target.value })}
              placeholder="произвольный callback_data"
            />
          )}
          <div>
            <Label className="text-[11px] text-zinc-500">Перейти к ноде (опц.)</Label>
            <NodePicker
              value={button.goto}
              onChange={(v) => onChange({ ...button, goto: v })}
              options={nodeOptions}
            />
          </div>
        </>
      )}
    </div>
  );
}

// Condition rule kinds. Extended in Iter 1 with "expr" so power users
// can plug a full expression-engine condition (e.g. `age >= 18 and
// country == "RU"`) instead of constructing it via the multi-field UI.
type CondKind = "tag" | "variable" | "expr" | "always";
type CondRule = { kind: CondKind; params: Record<string, unknown>; next: string };

function ConditionEditor({
  rules,
  onChange,
}: {
  rules: CondRule[];
  onChange: (rules: CondRule[]) => void;
}) {
  const setRule = (idx: number, patch: Partial<CondRule>) => {
    onChange(rules.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const removeRule = (idx: number) => {
    onChange(rules.filter((_, i) => i !== idx));
  };
  const addRule = () => {
    onChange([
      ...rules,
      { kind: "tag", params: { op: "has", value: "" }, next: "" },
    ]);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="mb-0">Правила</Label>
        <Button variant="outline" size="sm" onClick={addRule}>
          <Plus className="h-3 w-3" /> правило
        </Button>
      </div>
      <div className="text-[10px] text-zinc-500">
        Связи правил тяните от handle’ов на правом крае ноды. Первое сработавшее правило побеждает.
      </div>
      <div className="space-y-2">
        {rules.map((rule, idx) => (
          <div
            key={idx}
            className="border border-zinc-200 rounded p-2 space-y-2 bg-zinc-50/50"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-500">Правило {idx + 1}</span>
              <Button variant="ghost" size="sm" onClick={() => removeRule(idx)}>
                <Trash2 className="h-3 w-3 text-red-500" />
              </Button>
            </div>
            <Select
              value={rule.kind}
              onValueChange={(v) =>
                setRule(idx, {
                  kind: v as CondKind,
                  params:
                    v === "always"
                      ? {}
                      : v === "tag"
                      ? { op: "has", value: "" }
                      : v === "expr"
                      ? { expr: "" }
                      : { key: "", op: "eq", value: "" },
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tag">Тег</SelectItem>
                <SelectItem value="variable">Переменная</SelectItem>
                <SelectItem value="expr">Выражение</SelectItem>
                <SelectItem value="always">Всегда</SelectItem>
              </SelectContent>
            </Select>
            {rule.kind === "expr" && (
              <div>
                <Input
                  value={String(rule.params.expr ?? "")}
                  onChange={(e) =>
                    setRule(idx, {
                      params: { expr: e.target.value },
                    })
                  }
                  placeholder='age >= 18 and country == "RU"'
                />
                <div className="text-[10px] text-zinc-500 mt-1">
                  Полное выражение. Доступны переменные <code>client.x</code>,{" "}
                  <code>project.x</code>, <code>question</code>, операторы{" "}
                  <code>== != &lt; &lt;= &gt; &gt;=</code>, функции{" "}
                  <code>addDays</code>, <code>findall</code>, <code>similar</code> и др.
                </div>
              </div>
            )}
            {rule.kind === "tag" && (
              <div className="flex gap-2">
                <Select
                  value={String(rule.params.op ?? "has")}
                  onValueChange={(v) =>
                    setRule(idx, { params: { ...rule.params, op: v } })
                  }
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="has">есть</SelectItem>
                    <SelectItem value="not_has">нет</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  className="flex-1"
                  value={String(rule.params.value ?? "")}
                  onChange={(e) =>
                    setRule(idx, {
                      params: { ...rule.params, value: e.target.value },
                    })
                  }
                  placeholder="имя тега"
                />
              </div>
            )}
            {rule.kind === "variable" && (
              <>
                <Input
                  value={String(rule.params.key ?? "")}
                  onChange={(e) =>
                    setRule(idx, {
                      params: { ...rule.params, key: e.target.value },
                    })
                  }
                  placeholder="ключ (например, client.age или project.x)"
                />
                <div className="flex gap-2">
                  <Select
                    value={String(rule.params.op ?? "eq")}
                    onValueChange={(v) =>
                      setRule(idx, { params: { ...rule.params, op: v } })
                    }
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="eq">=</SelectItem>
                      <SelectItem value="ne">≠</SelectItem>
                      <SelectItem value="gt">&gt;</SelectItem>
                      <SelectItem value="gte">≥</SelectItem>
                      <SelectItem value="lt">&lt;</SelectItem>
                      <SelectItem value="lte">≤</SelectItem>
                      <SelectItem value="contains">содержит</SelectItem>
                      <SelectItem value="exists">существует</SelectItem>
                      <SelectItem value="not_exists">не существует</SelectItem>
                    </SelectContent>
                  </Select>
                  {rule.params.op !== "exists" && rule.params.op !== "not_exists" && (
                    <Input
                      className="flex-1"
                      value={String(rule.params.value ?? "")}
                      onChange={(e) =>
                        setRule(idx, {
                          params: { ...rule.params, value: e.target.value },
                        })
                      }
                      placeholder="значение"
                    />
                  )}
                </div>
              </>
            )}
          </div>
        ))}
        {rules.length === 0 && (
          <div className="text-xs text-zinc-400 italic">Нет правил</div>
        )}
      </div>
    </div>
  );
}

function HttpRequestEditor({
  node,
  onChange,
}: {
  node: Extract<FlowNode, { type: "http_request" }>;
  onChange: (patch: Partial<Extract<FlowNode, { type: "http_request" }>>) => void;
}) {
  const headers = node.headers ?? {};
  const headerEntries = Object.entries(headers);
  const setHeader = (oldKey: string | null, key: string, value: string) => {
    const next = { ...headers };
    if (oldKey && oldKey !== key) delete next[oldKey];
    if (key) next[key] = value;
    onChange({ headers: next });
  };
  const removeHeader = (key: string) => {
    const next = { ...headers };
    delete next[key];
    onChange({ headers: next });
  };
  const addHeader = () => {
    onChange({ headers: { ...headers, "": "" } });
  };

  return (
    <>
      <div>
        <Label>Метод</Label>
        <Select
          value={node.method}
          onValueChange={(v) =>
            onChange({ method: v as "GET" | "POST" | "PUT" | "PATCH" | "DELETE" })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="GET">GET</SelectItem>
            <SelectItem value="POST">POST</SelectItem>
            <SelectItem value="PUT">PUT</SelectItem>
            <SelectItem value="PATCH">PATCH</SelectItem>
            <SelectItem value="DELETE">DELETE</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>URL</Label>
        <Input
          value={node.url}
          onChange={(e) => onChange({ url: e.target.value })}
          placeholder="https://api.example.com/{{vars.x}}"
        />
        <div className="text-[10px] text-zinc-500 mt-1">
          Шаблоны разрешены — <code>{`{{vars.x}}`}</code>.
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <Label className="mb-0">Заголовки</Label>
          <Button variant="outline" size="sm" onClick={addHeader}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
        <div className="space-y-1">
          {headerEntries.map(([k, v]) => (
            <div key={k || "__empty__"} className="flex gap-1">
              <Input
                className="flex-1"
                placeholder="Имя"
                defaultValue={k}
                onBlur={(e) => setHeader(k, e.target.value, v)}
              />
              <Input
                className="flex-1"
                placeholder="Значение"
                defaultValue={v}
                onBlur={(e) => setHeader(k, k, e.target.value)}
              />
              <Button variant="ghost" size="sm" onClick={() => removeHeader(k)}>
                <Trash2 className="h-3 w-3 text-red-500" />
              </Button>
            </div>
          ))}
          {headerEntries.length === 0 && (
            <div className="text-[11px] text-zinc-400 italic">нет</div>
          )}
        </div>
      </div>
      {node.method !== "GET" && (
        <div>
          <Label>Тело</Label>
          <Textarea
            rows={3}
            value={node.body ?? ""}
            onChange={(e) => onChange({ body: e.target.value })}
            placeholder='{"key": "{{vars.x}}"}'
          />
        </div>
      )}
      <div>
        <Label>Сохранить ответ в vars. (опц.)</Label>
        <Input
          value={node.saveAs ?? ""}
          onChange={(e) => onChange({ saveAs: e.target.value || undefined })}
          placeholder="например, api_response"
        />
      </div>
      <div className="text-[11px] text-zinc-500 pt-2 border-t">
        Связи «ok» и «error» — тяните рёбра от handle’ов на ноде.
      </div>
    </>
  );
}

function GotoFlowEditor({
  flowId,
  flowList,
  currentFlowId,
  onChange,
}: {
  flowId: string;
  flowList: FlowListItem[];
  currentFlowId: string;
  onChange: (id: string) => void;
}) {
  const options = flowList.filter((f) => f.id !== currentFlowId);
  return (
    <div>
      <Label>Целевой сценарий</Label>
      <Select value={flowId || "__none__"} onValueChange={(v) => onChange(v === "__none__" ? "" : v)}>
        <SelectTrigger>
          <SelectValue placeholder="— выберите —" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— не выбрано —</SelectItem>
          {options.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {flowId && !options.find((f) => f.id === flowId) && (
        <div className="text-[10px] text-amber-600 mt-1">
          flowId «{flowId}» не найден в этом боте.
        </div>
      )}
    </div>
  );
}

function TriggersEditor({
  triggers,
  onChange,
}: {
  triggers: FlowTrigger[];
  onChange: (next: FlowTrigger[]) => void;
}) {
  const setTrigger = (idx: number, t: FlowTrigger) => {
    onChange(triggers.map((x, i) => (i === idx ? t : x)));
  };
  const removeTrigger = (idx: number) => onChange(triggers.filter((_, i) => i !== idx));
  const addTrigger = (type: FlowTrigger["type"]) => {
    let nt: FlowTrigger;
    if (type === "command") nt = { type: "command", command: "start" };
    else if (type === "keyword") nt = { type: "keyword", keywords: [""] };
    else if (type === "regex") nt = { type: "regex", pattern: "" };
    else nt = { type: "subscribed" };
    onChange([...triggers, nt]);
  };
  return (
    <div className="space-y-2">
      {triggers.map((t, idx) => (
        <div
          key={idx}
          className="border border-zinc-200 rounded p-2 space-y-2 bg-zinc-50/50"
        >
          <div className="flex items-center justify-between">
            <Badge variant="secondary" className="font-mono text-[10px]">
              {t.type}
            </Badge>
            <Button variant="ghost" size="sm" onClick={() => removeTrigger(idx)}>
              <Trash2 className="h-3 w-3 text-red-500" />
            </Button>
          </div>
          {t.type === "command" && (
            <>
              <div>
                <Label className="text-[11px]">Команда (без /)</Label>
                <Input
                  value={t.command}
                  onChange={(e) =>
                    setTrigger(idx, { ...t, command: e.target.value.replace(/^\//, "") })
                  }
                />
              </div>
              <div>
                <Label className="text-[11px]">Payloads (через запятую, опц.)</Label>
                <Input
                  value={(t.payloads ?? []).join(",")}
                  onChange={(e) =>
                    setTrigger(idx, {
                      ...t,
                      payloads: e.target.value
                        ? e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                        : undefined,
                    })
                  }
                  placeholder="например, leadmagnet, promo2025"
                />
              </div>
            </>
          )}
          {t.type === "keyword" && (
            <div>
              <Label className="text-[11px]">Ключевые слова (через запятую)</Label>
              <Input
                value={t.keywords.join(",")}
                onChange={(e) =>
                  setTrigger(idx, {
                    ...t,
                    keywords: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="хочу гайд, получить"
              />
            </div>
          )}
          {t.type === "regex" && (
            <div>
              <Label className="text-[11px]">RegExp (i)</Label>
              <Input
                value={t.pattern}
                onChange={(e) => setTrigger(idx, { ...t, pattern: e.target.value })}
                placeholder="^привет"
              />
            </div>
          )}
          {t.type === "subscribed" && (
            <div className="text-[11px] text-zinc-500">
              При первом /start (новом подписчике).
            </div>
          )}
        </div>
      ))}
      <div className="flex gap-1 flex-wrap pt-2 border-t">
        <Button size="sm" variant="outline" onClick={() => addTrigger("command")}>
          + /команда
        </Button>
        <Button size="sm" variant="outline" onClick={() => addTrigger("keyword")}>
          + слово
        </Button>
        <Button size="sm" variant="outline" onClick={() => addTrigger("regex")}>
          + regex
        </Button>
        <Button size="sm" variant="outline" onClick={() => addTrigger("subscribed")}>
          + subscribed
        </Button>
      </div>
    </div>
  );
}
