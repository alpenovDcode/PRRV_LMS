"use client";

import { Plus, Trash2, X, ExternalLink, MessageSquare } from "lucide-react";
import type { Node as RFNode } from "@xyflow/react";

interface NodeInspectorProps {
  node: RFNode | null;
  onChange: (id: string, patch: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
  onSetStart: (id: string) => void;
  onClose: () => void;
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
    {children}
  </label>
);

const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    className={`w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none ${props.className ?? ""}`}
  />
);

const Textarea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea
    {...props}
    className={`w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-y min-h-[80px] ${props.className ?? ""}`}
  />
);

const Select = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select
    {...props}
    className={`w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none ${props.className ?? ""}`}
  />
);

export function NodeInspector({ node, onChange, onDelete, onSetStart, onClose }: NodeInspectorProps) {
  if (!node) {
    return (
      <div className="w-80 bg-white border-l border-gray-200 p-6 text-center text-gray-400 text-sm">
        Кликни на узел, чтобы его отредактировать
      </div>
    );
  }

  const data = node.data as any;
  const type = data.type;

  return (
    <div className="w-80 bg-white border-l border-gray-200 flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div>
          <div className="font-semibold text-gray-900 text-sm">{type}</div>
          <div className="text-[10px] text-gray-400 font-mono">{node.id}</div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {!data.isStart && (
          <button
            onClick={() => onSetStart(node.id)}
            className="w-full text-xs px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
          >
            Сделать стартовым
          </button>
        )}

        {(type === "send_text" || type === "send_quick_replies" || type === "send_buttons") && (
          <div>
            <Label>Текст сообщения</Label>
            <Textarea
              value={data.text ?? ""}
              onChange={(e) => onChange(node.id, { text: e.target.value })}
              placeholder="{{subscriber.username}}, привет!"
            />
            <p className="text-[10px] text-gray-400 mt-1">
              Шаблоны: <code>{`{{subscriber.username}}`}</code>, <code>{`{{context.lastInput}}`}</code>, <code>{`{{now}}`}</code>
            </p>
          </div>
        )}

        {type === "send_quick_replies" && (
          <QuickRepliesEditor
            buttons={data.buttons ?? []}
            onChange={(buttons) => onChange(node.id, { buttons })}
          />
        )}

        {type === "send_buttons" && (
          <ButtonsEditor
            buttons={data.buttons ?? []}
            onChange={(buttons) => onChange(node.id, { buttons })}
          />
        )}

        {type === "wait_reply" && (
          <div>
            <Label>Timeout (часов)</Label>
            <Input
              type="number"
              min={1}
              value={Math.round((data.timeoutSec ?? 86400) / 3600)}
              onChange={(e) =>
                onChange(node.id, { timeoutSec: parseInt(e.target.value || "24") * 3600 })
              }
            />
            <p className="text-[10px] text-gray-400 mt-1">
              Через сколько часов отправлять onTimeout-ветку, если ответа нет
            </p>
          </div>
        )}

        {type === "condition" && (
          <ConditionEditor
            branches={data.branches ?? []}
            onChange={(branches) => onChange(node.id, { branches })}
          />
        )}

        {type === "set_variable" && (
          <>
            <div>
              <Label>Ключ</Label>
              <Input
                value={data.key ?? ""}
                onChange={(e) => onChange(node.id, { key: e.target.value })}
                placeholder="utm_source"
              />
            </div>
            <div>
              <Label>Значение</Label>
              <Input
                value={data.value ?? ""}
                onChange={(e) => onChange(node.id, { value: e.target.value })}
                placeholder="instagram"
              />
              <p className="text-[10px] text-gray-400 mt-1">
                Можно использовать шаблоны <code>{`{{context.x}}`}</code>
              </p>
            </div>
          </>
        )}

        {type === "end" && (
          <p className="text-xs text-gray-500 italic">
            Завершает воронку для подписчика. Узел не имеет настроек.
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-200">
        <button
          onClick={() => onDelete(node.id)}
          disabled={data.isStart}
          className="w-full flex items-center justify-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          title={data.isStart ? "Нельзя удалить стартовый узел" : ""}
        >
          <Trash2 className="w-3.5 h-3.5" /> Удалить узел
        </button>
      </div>
    </div>
  );
}

// ─── Под-редакторы ─────────────────────────────────────────────────────────

function QuickRepliesEditor({
  buttons,
  onChange,
}: {
  buttons: Array<{ title: string; payload: string }>;
  onChange: (b: any[]) => void;
}) {
  return (
    <div>
      <Label>Кнопки (Quick Replies, до 13)</Label>
      <div className="space-y-2">
        {buttons.map((b, i) => (
          <div key={i} className="flex gap-1">
            <Input
              value={b.title}
              maxLength={20}
              onChange={(e) => {
                const next = [...buttons];
                next[i] = { ...next[i], title: e.target.value };
                onChange(next);
              }}
              placeholder="Title"
              className="flex-1"
            />
            <Input
              value={b.payload}
              onChange={(e) => {
                const next = [...buttons];
                next[i] = { ...next[i], payload: e.target.value };
                onChange(next);
              }}
              placeholder="PAYLOAD"
              className="flex-1 font-mono text-xs"
            />
            <button
              onClick={() => onChange(buttons.filter((_, idx) => idx !== i))}
              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
      {buttons.length < 13 && (
        <button
          onClick={() => onChange([...buttons, { title: "Кнопка", payload: `OPT_${buttons.length + 1}` }])}
          className="mt-2 w-full flex items-center justify-center gap-1 px-3 py-1.5 bg-violet-50 text-violet-700 border border-violet-200 border-dashed rounded-lg hover:bg-violet-100 transition-colors text-xs"
        >
          <Plus className="w-3 h-3" /> Добавить кнопку
        </button>
      )}
    </div>
  );
}

function ButtonsEditor({
  buttons,
  onChange,
}: {
  buttons: any[];
  onChange: (b: any[]) => void;
}) {
  return (
    <div>
      <Label>Кнопки (до 3, URL/postback)</Label>
      <div className="space-y-2">
        {buttons.map((b, i) => (
          <div key={i} className="p-2 border border-gray-200 rounded-lg space-y-1">
            <div className="flex items-center gap-1">
              <Select
                value={b.type ?? "url"}
                onChange={(e) => {
                  const next = [...buttons];
                  next[i] = e.target.value === "url" ? { type: "url", title: b.title ?? "", url: b.url ?? "" } : { type: "postback", title: b.title ?? "", payload: b.payload ?? "" };
                  onChange(next);
                }}
                className="!w-auto text-xs"
              >
                <option value="url">URL</option>
                <option value="postback">Postback</option>
              </Select>
              <button
                onClick={() => onChange(buttons.filter((_, idx) => idx !== i))}
                className="ml-auto p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <Input
              value={b.title}
              maxLength={20}
              onChange={(e) => {
                const next = [...buttons];
                next[i] = { ...next[i], title: e.target.value };
                onChange(next);
              }}
              placeholder="Title (≤ 20 chars)"
            />
            {b.type === "url" ? (
              <Input
                value={b.url ?? ""}
                onChange={(e) => {
                  const next = [...buttons];
                  next[i] = { ...next[i], url: e.target.value };
                  onChange(next);
                }}
                placeholder="https://prrv.tech/..."
                type="url"
              />
            ) : (
              <Input
                value={b.payload ?? ""}
                onChange={(e) => {
                  const next = [...buttons];
                  next[i] = { ...next[i], payload: e.target.value };
                  onChange(next);
                }}
                placeholder="PAYLOAD"
                className="font-mono text-xs"
              />
            )}
          </div>
        ))}
      </div>
      {buttons.length < 3 && (
        <button
          onClick={() => onChange([...buttons, { type: "url", title: "Открыть", url: "https://prrv.tech" }])}
          className="mt-2 w-full flex items-center justify-center gap-1 px-3 py-1.5 bg-pink-50 text-pink-700 border border-pink-200 border-dashed rounded-lg hover:bg-pink-100 transition-colors text-xs"
        >
          <Plus className="w-3 h-3" /> Добавить кнопку
        </button>
      )}
    </div>
  );
}

function ConditionEditor({
  branches,
  onChange,
}: {
  branches: any[];
  onChange: (b: any[]) => void;
}) {
  return (
    <div>
      <Label>Ветки условия</Label>
      <div className="space-y-2">
        {branches.map((br, i) => (
          <div key={i} className="p-2 border border-gray-200 rounded-lg space-y-1">
            <div className="flex items-center gap-1">
              <Select
                value={br.field ?? "lastInput"}
                onChange={(e) => {
                  const next = [...branches];
                  next[i] = { ...next[i], field: e.target.value };
                  onChange(next);
                }}
                className="!w-auto text-xs"
              >
                <option value="lastInput">lastInput</option>
                <option value="lastPayload">lastPayload</option>
              </Select>
              <Select
                value={br.match ?? "contains"}
                onChange={(e) => {
                  const next = [...branches];
                  next[i] = { ...next[i], match: e.target.value };
                  onChange(next);
                }}
                className="!w-auto text-xs"
              >
                <option value="contains">contains</option>
                <option value="exact">exact</option>
                <option value="starts_with">starts_with</option>
                <option value="regex">regex</option>
              </Select>
              <button
                onClick={() => onChange(branches.filter((_, idx) => idx !== i))}
                className="ml-auto p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <Input
              value={br.value ?? ""}
              onChange={(e) => {
                const next = [...branches];
                next[i] = { ...next[i], value: e.target.value };
                onChange(next);
              }}
              placeholder="Значение для сравнения"
            />
          </div>
        ))}
      </div>
      <button
        onClick={() => onChange([...branches, { field: "lastInput", match: "contains", value: "", next: null }])}
        className="mt-2 w-full flex items-center justify-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 border-dashed rounded-lg hover:bg-indigo-100 transition-colors text-xs"
      >
        <Plus className="w-3 h-3" /> Добавить ветку
      </button>
    </div>
  );
}
