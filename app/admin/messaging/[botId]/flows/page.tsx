"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Plus, MessageSquare, ToggleLeft, ToggleRight, Trash2, ArrowLeft, Zap } from "lucide-react";
import Link from "next/link";

interface Flow {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  runCount: number;
  triggers: { id: string; type: string; keywords: string[]; triggerCount: number }[];
  _count: { runs: number };
  createdAt: string;
}

/** Дефолтный пример графа для нового flow — приветствие + ожидание ответа + ветвление. */
const STARTER_GRAPH = {
  startNodeId: "n1",
  nodes: {
    n1: {
      type: "send_text",
      text: "Привет, {{subscriber.username}}! Чем могу помочь?",
      next: "n2",
    },
    n2: {
      type: "wait_reply",
      timeoutSec: 86400,
      onReply: "n3",
      onTimeout: "n4",
    },
    n3: {
      type: "send_text",
      text: "Спасибо! Скоро ответим.",
      next: "n5",
    },
    n4: {
      type: "send_text",
      text: "Не получил ответа — пиши когда будет удобно.",
      next: "n5",
    },
    n5: { type: "end" },
  },
};

export default function BotFlowsPage() {
  const { botId } = useParams<{ botId: string }>();
  const router = useRouter();
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const load = () => {
    setLoading(true);
    fetch(`/api/admin/messaging/bots/${botId}/flows`)
      .then((r) => r.json())
      .then((d) => setFlows(d.data ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(load, [botId]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/admin/messaging/bots/${botId}/flows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), graph: STARTER_GRAPH }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        router.push(`/admin/messaging/${botId}/flows/${data.data.id}`);
      } else {
        alert(data.error ?? "Ошибка создания");
      }
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (flow: Flow) => {
    await fetch(`/api/admin/messaging/flows/${flow.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !flow.isActive }),
    });
    load();
  };

  const handleDelete = async (flow: Flow) => {
    if (!confirm(`Удалить воронку «${flow.name}»? Это удалит и все её запуски.`)) return;
    await fetch(`/api/admin/messaging/flows/${flow.id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link href="/admin/messaging" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4">
        <ArrowLeft className="w-4 h-4" /> К списку аккаунтов
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Воронки</h1>
          <p className="text-sm text-gray-500 mt-0.5">Бот #{botId.slice(0, 8)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/messaging/${botId}/inbox`}
            className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Inbox
          </Link>
          <Link
            href={`/admin/messaging/${botId}/broadcasts`}
            className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Рассылки
          </Link>
          <Link
            href={`/admin/messaging/${botId}/lists`}
            className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Списки
          </Link>
          <Link
            href={`/admin/messaging/${botId}/fields`}
            className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Поля
          </Link>
        </div>
      </div>

      {/* Создание новой */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Название воронки"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" /> Создать
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Создастся стартовая воронка с примером графа — отредактируешь её ниже.
        </p>
      </div>

      {/* Список */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Загрузка…</div>
        ) : flows.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            Воронок пока нет — создай первую сверху
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {flows.map((flow) => (
              <div key={flow.id} className="p-4 flex items-center gap-3">
                <button onClick={() => handleToggle(flow)} className="shrink-0">
                  {flow.isActive ? (
                    <ToggleRight className="w-7 h-7 text-blue-500" />
                  ) : (
                    <ToggleLeft className="w-7 h-7 text-gray-300" />
                  )}
                </button>

                <Link href={`/admin/messaging/${botId}/flows/${flow.id}`} className="flex-1 min-w-0 group">
                  <div className="flex items-center gap-2 flex-wrap">
                    <MessageSquare className="w-4 h-4 text-gray-400" />
                    <span className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                      {flow.name}
                    </span>
                    {!flow.isActive && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">отключена</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Zap className="w-3 h-3" /> {flow.triggers.length} триггеров
                    </span>
                    <span>{flow.runCount} запусков</span>
                    <span>{flow._count.runs} активных</span>
                  </div>
                </Link>

                <button
                  onClick={() => handleDelete(flow)}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
