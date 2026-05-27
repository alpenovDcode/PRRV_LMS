"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Plus, Trash2, Users, Tag, ListChecks, X, Loader2 } from "lucide-react";

interface MList {
  id: string;
  name: string;
  description: string | null;
  type: "static" | "dynamic";
  rules: any;
  memberCount: number;
  createdAt: string;
}

export default function ListsPage() {
  const { botId } = useParams<{ botId: string }>();
  const [lists, setLists] = useState<MList[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = () => {
    setLoading(true);
    fetch(`/api/admin/messaging/bots/${botId}/lists`)
      .then((r) => r.json())
      .then((d) => setLists(d.data ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(load, [botId]);

  const handleDelete = async (id: string) => {
    if (!confirm("Удалить список? Подписчики останутся, но потеряют членство.")) return;
    await fetch(`/api/admin/messaging/lists/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link
        href={`/admin/messaging/${botId}/flows`}
        className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> К воронкам
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ListChecks className="w-6 h-6 text-blue-500" /> Списки подписчиков
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Сегменты для рассылок и условий в воронках
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> Создать список
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Загрузка…</div>
      ) : lists.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">
          Списков пока нет
        </div>
      ) : (
        <div className="space-y-2">
          {lists.map((list) => (
            <div
              key={list.id}
              className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-900">{list.name}</span>
                  <span
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                      list.type === "dynamic"
                        ? "bg-purple-50 text-purple-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {list.type === "dynamic" ? "динамический" : "статический"}
                  </span>
                </div>
                {list.description && (
                  <div className="text-xs text-gray-500 mt-0.5">{list.description}</div>
                )}
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" /> {list.memberCount} подписчиков
                  </span>
                  {list.type === "dynamic" && list.rules?.tags && (
                    <span className="flex items-center gap-1">
                      <Tag className="w-3 h-3" /> теги: {list.rules.tags.join(", ")}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleDelete(list.id)}
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateListModal
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

function CreateListModal({
  botId,
  onClose,
  onDone,
}: {
  botId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"static" | "dynamic">("static");
  const [tagsRaw, setTagsRaw] = useState("");
  const [excludeTagsRaw, setExcludeTagsRaw] = useState("");
  const [anyOrAll, setAnyOrAll] = useState<"any" | "all">("all");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setSaving(true);
    const body: any = {
      name: name.trim(),
      description: description.trim() || undefined,
      type,
    };
    if (type === "dynamic") {
      body.rules = {
        tags: tagsRaw.split(",").map((s) => s.trim()).filter(Boolean),
        excludeTags: excludeTagsRaw.split(",").map((s) => s.trim()).filter(Boolean),
        anyOrAll,
      };
    }
    const res = await fetch(`/api/admin/messaging/bots/${botId}/lists`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) onDone();
    else alert("Не удалось создать список");
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">Новый список</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Название *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Описание</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Тип</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setType("static")}
                className={`p-2 rounded-lg border text-xs ${
                  type === "static"
                    ? "bg-blue-50 text-blue-700 border-blue-300"
                    : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                Статический
                <div className="text-[10px] text-gray-500 mt-0.5">
                  Добавляются вручную / через flow-action
                </div>
              </button>
              <button
                onClick={() => setType("dynamic")}
                className={`p-2 rounded-lg border text-xs ${
                  type === "dynamic"
                    ? "bg-blue-50 text-blue-700 border-blue-300"
                    : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                Динамический
                <div className="text-[10px] text-gray-500 mt-0.5">
                  Авто-обновление по тегам
                </div>
              </button>
            </div>
          </div>
          {type === "dynamic" && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Включаемые теги (через запятую)
                </label>
                <input
                  value={tagsRaw}
                  onChange={(e) => setTagsRaw(e.target.value)}
                  placeholder="vip, lead, paid"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Исключаемые теги
                </label>
                <input
                  value={excludeTagsRaw}
                  onChange={(e) => setExcludeTagsRaw(e.target.value)}
                  placeholder="unsubscribed, churned"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Условие на включаемые теги
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAnyOrAll("all")}
                    className={`px-3 py-1.5 text-xs rounded-lg border ${
                      anyOrAll === "all" ? "bg-blue-50 text-blue-700 border-blue-300" : "border-gray-200"
                    }`}
                  >
                    Все теги
                  </button>
                  <button
                    onClick={() => setAnyOrAll("any")}
                    className={`px-3 py-1.5 text-xs rounded-lg border ${
                      anyOrAll === "any" ? "bg-blue-50 text-blue-700 border-blue-300" : "border-gray-200"
                    }`}
                  >
                    Любой из тегов
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
            Отмена
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !name.trim()}
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
