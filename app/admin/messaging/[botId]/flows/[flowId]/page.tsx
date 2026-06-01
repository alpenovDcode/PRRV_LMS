"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2, Zap, Hash, Code } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { BackendGraph } from "@/components/messaging/flow-editor/graph-converter";

// FlowEditor — клиентский, монтируем динамически чтобы избежать SSR-проблем
// с React Flow.
const FlowEditor = dynamic(() => import("@/components/messaging/flow-editor/FlowEditor"), {
  ssr: false,
  loading: () => (
    <div className="h-[600px] bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-center text-gray-400 text-sm">
      Загрузка редактора…
    </div>
  ),
});

interface Trigger {
  id: string;
  type: string;
  keywords: string[];
  matchType: string;
  caseSensitive: boolean;
  mediaIds: string[];
  triggerCount: number;
  lastTriggeredAt: string | null;
}

interface FlowDetail {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  graph: BackendGraph;
  triggers: Trigger[];
  bot: { id: string; channel: string; title: string };
  _count: { runs: number };
  runCount: number;
}

const TRIGGER_TYPE_LABELS: Record<string, string> = {
  keyword_dm: "Ключевое слово в DM",
  keyword_comment: "Ключевое слово в комментарии",
  story_reply: "Ответ на сторис",
  mention: "Упоминание в сторис/посте",
  subscriber_joined: "Новый подписчик",
  manual: "Ручной запуск",
};

export default function FlowEditPage() {
  const { botId, flowId } = useParams<{ botId: string; flowId: string }>();

  const [flow, setFlow] = useState<FlowDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showJsonView, setShowJsonView] = useState(false);

  // JSON-редактирование графа: можно вставить готовый JSON и применить.
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [jsonSaving, setJsonSaving] = useState(false);
  // key бампается после Apply, чтобы перемонтировать визуальный FlowEditor
  // с новым initialGraph.
  const [editorKey, setEditorKey] = useState(0);

  // ── Trigger form ─────────────────────────────────────────────────────────
  const [trigType, setTrigType] = useState("keyword_dm");
  const [trigKeywords, setTrigKeywords] = useState("");
  const [trigMatchType, setTrigMatchType] = useState("contains");
  const [trigCaseSensitive, setTrigCaseSensitive] = useState(false);

  const load = () => {
    setLoading(true);
    fetch(`/api/admin/messaging/flows/${flowId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setFlow(d.data);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [flowId]);

  const handleSaveGraph = async (graph: BackendGraph) => {
    const res = await fetch(`/api/admin/messaging/flows/${flowId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ graph }),
    });
    if (!res.ok) {
      const d = await res.json();
      throw new Error(d.error ?? "Ошибка сохранения");
    }
  };

  const handleAddTrigger = async () => {
    const keywords = trigKeywords.split("\n").map((s) => s.trim()).filter(Boolean);
    const res = await fetch(`/api/admin/messaging/flows/${flowId}/triggers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: trigType,
        keywords,
        matchType: trigMatchType,
        caseSensitive: trigCaseSensitive,
      }),
    });
    if (res.ok) {
      setTrigKeywords("");
      load();
    } else {
      alert("Не удалось добавить триггер");
    }
  };

  const handleDeleteTrigger = async (triggerId: string) => {
    if (!confirm("Удалить триггер?")) return;
    await fetch(`/api/admin/messaging/triggers/${triggerId}`, { method: "DELETE" });
    load();
  };

  // ── JSON-режим: prefill, валидация, применение ─────────────────────────
  useEffect(() => {
    if (flow && showJsonView) {
      setJsonText(JSON.stringify(flow.graph, null, 2));
      setJsonError(null);
    }
  }, [flow, showJsonView]);

  const handleApplyJson = async () => {
    setJsonError(null);
    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e: any) {
      setJsonError("Невалидный JSON: " + (e?.message ?? String(e)));
      return;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      setJsonError("Ожидался объект с полями startNodeId и nodes");
      return;
    }
    if (typeof parsed.startNodeId !== "string" || !parsed.startNodeId) {
      setJsonError('Поле "startNodeId" должно быть непустой строкой');
      return;
    }
    if (!parsed.nodes || typeof parsed.nodes !== "object" || Array.isArray(parsed.nodes)) {
      setJsonError('Поле "nodes" должно быть объектом { "id": { ... } }');
      return;
    }
    if (!(parsed.startNodeId in parsed.nodes)) {
      setJsonError(`startNodeId "${parsed.startNodeId}" не найден среди узлов nodes`);
      return;
    }
    for (const [nid, n] of Object.entries<any>(parsed.nodes)) {
      if (!n || typeof n !== "object" || typeof n.type !== "string") {
        setJsonError(`Узел "${nid}" должен быть объектом с полем "type"`);
        return;
      }
    }

    setJsonSaving(true);
    try {
      await handleSaveGraph(parsed as BackendGraph);
      load();
      // Перемонтируем визуальный редактор, чтобы он подхватил новый граф
      setEditorKey((k) => k + 1);
    } catch (err: any) {
      setJsonError(err?.message ?? "Ошибка сохранения");
    } finally {
      setJsonSaving(false);
    }
  };

  const handleResetJson = () => {
    if (flow) setJsonText(JSON.stringify(flow.graph, null, 2));
    setJsonError(null);
  };

  if (loading) {
    return <div className="p-6 text-center text-gray-400 text-sm">Загрузка…</div>;
  }
  if (!flow) {
    return <div className="p-6 text-center text-red-500 text-sm">Не найдено</div>;
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-4">
      <Link
        href={`/admin/messaging/${botId}/flows`}
        className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
      >
        <ArrowLeft className="w-4 h-4" /> К воронкам
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{flow.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {flow.bot.title} ({flow.bot.channel}) · {flow.runCount} запусков · {flow._count.runs} активных
          </p>
        </div>
        <button
          onClick={() => setShowJsonView((s) => !s)}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 px-3 py-1.5 rounded-lg transition-colors"
        >
          <Code className="w-3.5 h-3.5" /> {showJsonView ? "Скрыть JSON" : "Показать JSON"}
        </button>
      </div>

      {/* ── Drag-n-drop редактор воронки ─────────────────────────────── */}
      <FlowEditor key={editorKey} initialGraph={flow.graph} onSave={handleSaveGraph} />

      {/* ── Триггеры — два блока в строку ─────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Добавить триггер */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" /> Добавить триггер
          </h2>
          <div className="space-y-2 text-sm">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Тип</label>
              <select
                value={trigType}
                onChange={(e) => setTrigType(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              >
                {Object.entries(TRIGGER_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Ключевые слова (по одному на строку; пусто = любой ввод)
              </label>
              <textarea
                value={trigKeywords}
                onChange={(e) => setTrigKeywords(e.target.value)}
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                placeholder={"цена\nкупить\nкурс"}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Тип совпадения</label>
                <select
                  value={trigMatchType}
                  onChange={(e) => setTrigMatchType(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="contains">Содержит</option>
                  <option value="exact">Точное</option>
                  <option value="starts_with">Начинается с</option>
                  <option value="regex">Regex</option>
                </select>
              </div>
              <label className="flex items-end pb-2 gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={trigCaseSensitive}
                  onChange={(e) => setTrigCaseSensitive(e.target.checked)}
                />
                Учитывать регистр
              </label>
            </div>
            <button
              onClick={handleAddTrigger}
              className="w-full mt-2 flex items-center justify-center gap-1 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" /> Добавить триггер
            </button>
          </div>
        </div>

        {/* Активные триггеры */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-700">Активные триггеры</h2>
          </div>
          {flow.triggers.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">
              Триггеров нет. Воронка не запустится автоматически.
            </div>
          ) : (
            <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
              {flow.triggers.map((t) => (
                <div key={t.id} className="p-3 flex items-center gap-2">
                  <Hash className="w-4 h-4 text-amber-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900">{TRIGGER_TYPE_LABELS[t.type]}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {t.keywords.length === 0 ? (
                        <span className="italic">любой ввод</span>
                      ) : (
                        t.keywords.map((k) => (
                          <span key={k} className="inline-block bg-gray-100 px-1.5 py-0.5 rounded mr-1">
                            {k}
                          </span>
                        ))
                      )}
                      <span className="ml-2 text-gray-400">
                        {t.matchType} · сработал {t.triggerCount}×
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteTrigger(t.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* JSON-режим: можно отредактировать и применить новый граф */}
      {showJsonView && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Code className="w-4 h-4" /> JSON графа (редактируется)
            </div>
            <div className="text-xs text-gray-500">
              Формат:{" "}
              <code className="bg-gray-100 px-1.5 py-0.5 rounded">{'{ "startNodeId": "n1", "nodes": { "n1": { "type": "send_text", ... } } }'}</code>
            </div>
          </div>
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            rows={20}
            spellCheck={false}
            className="w-full font-mono text-xs bg-gray-900 text-gray-100 rounded-lg p-3 outline-none focus:ring-2 focus:ring-blue-500"
          />
          {jsonError && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 font-medium">
              {jsonError}
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleApplyJson}
              disabled={jsonSaving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {jsonSaving ? "Сохраняю…" : "Применить JSON"}
            </button>
            <button
              onClick={handleResetJson}
              disabled={jsonSaving}
              className="px-4 py-2 border border-gray-200 hover:bg-gray-50 disabled:opacity-50 text-sm rounded-lg transition-colors"
            >
              Сбросить к сохранённому
            </button>
            <button
              onClick={() => {
                try {
                  navigator.clipboard?.writeText(jsonText);
                } catch {}
              }}
              disabled={jsonSaving}
              className="px-4 py-2 border border-gray-200 hover:bg-gray-50 disabled:opacity-50 text-sm rounded-lg transition-colors"
            >
              Скопировать
            </button>
            <span className="text-xs text-gray-400 ml-auto">
              После применения визуальный редактор обновится автоматически.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
