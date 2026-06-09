"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2, Link2, Copy, Check } from "lucide-react";

interface TrackingLink {
  id: string;
  slug: string;
  targetUrl: string;
  attachTag: string | null;
  clickCount: number;
  createdAt: string;
}

export default function TrackingLinksPage() {
  const { botId } = useParams<{ botId: string }>();
  const [links, setLinks] = useState<TrackingLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ slug: "", targetUrl: "", attachTag: "" });
  const [creating, setCreating] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch(`/api/admin/messaging/bots/${botId}/tracking-links`)
      .then((r) => r.json())
      .then((d) => setLinks(d.data ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(load, [botId]);

  const handleCreate = async () => {
    if (!form.slug.trim() || !form.targetUrl.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/admin/messaging/bots/${botId}/tracking-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: form.slug.trim(),
          targetUrl: form.targetUrl.trim(),
          attachTag: form.attachTag.trim() || null,
        }),
      });
      const d = await res.json();
      if (d.success) {
        setForm({ slug: "", targetUrl: "", attachTag: "" });
        setShowForm(false);
        load();
      } else {
        alert(d.error ?? "Ошибка");
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (link: TrackingLink) => {
    if (!confirm(`Удалить ссылку «${link.slug}»?`)) return;
    await fetch(`/api/admin/messaging/tracking-links/${link.id}`, { method: "DELETE" });
    load();
  };

  const buildLink = (slug: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/m/${slug}`;
  };

  const copyToClipboard = (slug: string) => {
    navigator.clipboard?.writeText(buildLink(slug));
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 1500);
  };

  return (
    <div className="max-w-5xl mx-auto"><div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Link2 className="w-6 h-6" /> Tracking-ссылки
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Короткие ссылки с метриками кликов и атрибуцией
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg flex items-center gap-1"
        >
          <Plus className="w-4 h-4" /> Новая ссылка
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Создание</h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Slug (короткое имя)</label>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="promo, course-launch, ig-bio"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Целевой URL</label>
              <input
                type="url"
                value={form.targetUrl}
                onChange={(e) => setForm({ ...form, targetUrl: e.target.value })}
                placeholder="https://..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Тег при клике (опционально)</label>
              <input
                type="text"
                value={form.attachTag}
                onChange={(e) => setForm({ ...form, attachTag: e.target.value })}
                placeholder="клик-промо"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <p className="text-xs text-gray-400 mt-1">
                Если в URL передан ?s=&lt;subscriber.id&gt;, тег добавится подписчику автоматически
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowForm(false)}
                className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
              >
                Отмена
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !form.slug || !form.targetUrl}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg disabled:opacity-50"
              >
                {creating ? "Создание…" : "Создать"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Загрузка…</div>
        ) : links.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            Ссылок ещё нет — создай первую
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {links.map((link) => (
              <div key={link.id} className="p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <code className="text-sm font-mono text-blue-600">/m/{link.slug}</code>
                    {link.attachTag && (
                      <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
                        +тег: {link.attachTag}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 truncate">→ {link.targetUrl}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-gray-900 tabular-nums">{link.clickCount}</div>
                  <div className="text-xs text-gray-400">кликов</div>
                </div>
                <button
                  onClick={() => copyToClipboard(link.slug)}
                  className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg"
                  title="Скопировать"
                >
                  {copiedSlug === link.slug ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={() => handleDelete(link)}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 text-xs text-gray-500">
        <p className="mb-1">
          <strong>Использование в воронке:</strong> добавь в текст сообщения{" "}
          <code className="bg-gray-100 px-1.5 py-0.5 rounded">
            {`{{NEXT_PUBLIC_APP_URL}}/m/<slug>?s={{subscriber.id}}`}
          </code>
        </p>
        <p>Параметр <code className="bg-gray-100 px-1.5 py-0.5 rounded">?s=</code> позволяет атрибутировать клик к подписчику.</p>
      </div>
    </div>
  );
}
