"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Plus, Trash2, X, Loader2, Variable } from "lucide-react";

interface CustomField {
  id: string;
  key: string;
  label: string;
  type: "text" | "number" | "date" | "email" | "phone" | "url" | "bool" | "select";
  options: string[];
  required: boolean;
  sortOrder: number;
}

const TYPE_LABELS: Record<string, string> = {
  text: "Текст",
  number: "Число",
  date: "Дата",
  email: "Email",
  phone: "Телефон",
  url: "URL",
  bool: "Да/Нет",
  select: "Выбор из списка",
};

export default function FieldsPage() {
  const { botId } = useParams<{ botId: string }>();
  const [fields, setFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = () => {
    setLoading(true);
    fetch(`/api/admin/messaging/bots/${botId}/custom-fields`)
      .then((r) => r.json())
      .then((d) => setFields(d.data ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(load, [botId]);

  const handleDelete = async (id: string) => {
    if (!confirm("Удалить поле? Значения у подписчиков останутся (в variables), но поле пропадёт из UI.")) return;
    await fetch(`/api/admin/messaging/custom-fields/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link
        href={`/admin/messaging/${botId}/flows`}
        className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> К воронкам
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Variable className="w-6 h-6 text-purple-500" /> Поля подписчиков
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Типизированные кастомные поля для накопления данных в воронках
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
        >
          <Plus className="w-4 h-4" /> Добавить поле
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Загрузка…</div>
      ) : fields.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">
          Полей пока нет
        </div>
      ) : (
        <div className="space-y-2">
          {fields.map((f) => (
            <div key={f.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-900">{f.label}</span>
                  <code className="text-xs text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
                    {f.key}
                  </code>
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-purple-50 text-purple-700">
                    {TYPE_LABELS[f.type]}
                  </span>
                  {f.required && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-50 text-red-600">
                      обязательное
                    </span>
                  )}
                </div>
                {f.type === "select" && f.options.length > 0 && (
                  <div className="text-xs text-gray-500 mt-0.5">
                    Опции: {f.options.join(", ")}
                  </div>
                )}
              </div>
              <button
                onClick={() => handleDelete(f.id)}
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateFieldModal
          botId={botId}
          onClose={() => setShowCreate(false)}
          onDone={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function CreateFieldModal({
  botId,
  onClose,
  onDone,
}: {
  botId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [type, setType] = useState<CustomField["type"]>("text");
  const [optionsRaw, setOptionsRaw] = useState("");
  const [required, setRequired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");
    setSaving(true);
    const options =
      type === "select"
        ? optionsRaw.split("\n").map((s) => s.trim()).filter(Boolean)
        : [];
    const res = await fetch(`/api/admin/messaging/bots/${botId}/custom-fields`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: key.trim(),
        label: label.trim(),
        type,
        options,
        required,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok && data.success) {
      onDone();
    } else {
      setError(data.error ?? "Ошибка");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">Новое поле</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Технический ключ *</label>
              <input
                value={key}
                onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                placeholder="company_name"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 font-mono text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Подпись *</label>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Название компании"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Тип</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as any)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
            >
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {type === "select" && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Опции (каждая с новой строки)
              </label>
              <textarea
                value={optionsRaw}
                onChange={(e) => setOptionsRaw(e.target.value)}
                rows={4}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder={"Москва\nСПб\nНовосибирск"}
              />
            </div>
          )}

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
            />
            <span>Обязательное</span>
          </label>

          {error && (
            <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="text-[10px] text-gray-400">
            В шаблонах: <code>{`{{subscriber.variables.${key || "ваш_ключ"}}}`}</code>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
            Отмена
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !key.trim() || !label.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Создать
          </button>
        </div>
      </div>
    </div>
  );
}
