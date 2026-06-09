"use client";

import { useEffect, useState, useMemo } from "react";
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Tag, Clock, BookOpen, Search, X, Check, Link as LinkIcon, Copy } from "lucide-react";
import { toast } from "sonner";

interface CourseOption {
  id: string;
  title: string;
  slug: string;
  isPublished: boolean;
}

interface Offer {
  id: string;
  title: string;
  description: string | null;
  price: string;
  oldPrice: string | null;
  currency: string;
  isActive: boolean;
  accessDays: number | null;
  courseIds: string[];
  tariff: string | null;
  features: string[];
  sortOrder: number;
  /** Публичный slug — URL /offer/<slug> для рассылок/постов в TG. */
  publicSlug: string | null;
  _count: { orders: number };
}

const TARIFF_LABELS: Record<string, string> = { VR: "VR", LR: "LR", SR: "SR" };

/**
 * Безопасно достаёт текст ошибки из ответа API.
 * Обрабатывает пустое тело и оба формата error: строка или {code, message}.
 */
async function extractError(res: Response): Promise<string> {
  try {
    const text = await res.text();
    if (!text) return `Ошибка ${res.status}`;
    const data = JSON.parse(text);
    const err = data?.error;
    if (typeof err === "string") return err;
    if (err?.message) return err.message;
    return `Ошибка ${res.status}`;
  } catch {
    return `Ошибка ${res.status}`;
  }
}

function formatPrice(p: string) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(Number(p));
}

// ─── Форма создания / редактирования ──────────────────────────────────────────

function OfferForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<Offer>;
  onSave: (data: any) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    price: initial?.price ?? "",
    oldPrice: initial?.oldPrice ?? "",
    accessDays: initial?.accessDays ? String(initial.accessDays) : "",
    tariff: initial?.tariff ?? "",
    features: (initial?.features ?? []).join("\n"),
    sortOrder: String(initial?.sortOrder ?? 0),
    isActive: initial?.isActive ?? true,
    publicSlug: initial?.publicSlug ?? "",
  });
  // courseIds — массив; селектор управляет им через CoursePicker
  const [courseIds, setCourseIds] = useState<string[]>(initial?.courseIds ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave({
        title: form.title.trim(),
        description: form.description.trim() || null,
        price: parseFloat(form.price),
        oldPrice: form.oldPrice ? parseFloat(form.oldPrice) : null,
        accessDays: form.accessDays ? parseInt(form.accessDays) : null,
        tariff: form.tariff || null,
        features: form.features.split("\n").map((s) => s.trim()).filter(Boolean),
        courseIds,
        sortOrder: parseInt(form.sortOrder) || 0,
        isActive: form.isActive,
        publicSlug: form.publicSlug.trim()
          ? form.publicSlug.trim().toLowerCase()
          : null,
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Название *</label>
          <input
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="Курс Прорыв — Тариф VR"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
          <textarea
            rows={2}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Цена (₽) *</label>
          <input
            required
            type="number"
            min="0"
            step="0.01"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="29900"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Старая цена (₽)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.oldPrice}
            onChange={(e) => setForm({ ...form, oldPrice: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="59900"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Доступ (дней, пусто = бессрочно)</label>
          <input
            type="number"
            min="1"
            value={form.accessDays}
            onChange={(e) => setForm({ ...form, accessDays: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="365"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Тариф</label>
          <select
            value={form.tariff}
            onChange={(e) => setForm({ ...form, tariff: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
          >
            <option value="">— не менять —</option>
            <option value="SR">SR</option>
            <option value="LR">LR</option>
            <option value="VR">VR</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Что входит (каждый пункт с новой строки)
          </label>
          <textarea
            rows={4}
            value={form.features}
            onChange={(e) => setForm({ ...form, features: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none font-mono"
            placeholder={"Доступ ко всем модулям\nПроверка заданий куратором\nСертификат"}
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Курсы, которые откроются при покупке
          </label>
          <CoursePicker value={courseIds} onChange={setCourseIds} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Порядок сортировки</label>
          <input
            type="number"
            value={form.sortOrder}
            onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        <div className="flex items-center gap-3 pt-6">
          <label className="text-sm font-medium text-gray-700">Активен</label>
          <button
            type="button"
            onClick={() => setForm({ ...form, isActive: !form.isActive })}
            className={`relative w-10 h-6 rounded-full transition-colors ${form.isActive ? "bg-blue-600" : "bg-gray-300"}`}
          >
            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.isActive ? "translate-x-5" : "translate-x-1"}`} />
          </button>
        </div>

        {/* Публичная ссылка на оффер — для постов в TG / рассылок */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Публичная ссылка (slug)
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400 whitespace-nowrap">
              /offer/
            </span>
            <input
              value={form.publicSlug}
              onChange={(e) =>
                setForm({
                  ...form,
                  publicSlug: e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, ""),
                })
              }
              placeholder="proriv-vr"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-mono"
            />
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            Если задан — любой посетитель сможет открыть страницу оплаты по
            этой ссылке. Каждый получит свой заказ. Латиница, цифры и дефис.
            Оставьте пустым, чтобы оффер продавался только через гостевые
            ссылки менеджера.
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Сохраняю…" : "Сохранить"}
        </button>
        <button type="button" onClick={onCancel} className="px-5 py-2 border border-gray-200 text-sm rounded-lg hover:bg-gray-50 transition-colors">
          Отмена
        </button>
      </div>
    </form>
  );
}

// ─── Основная страница ──────────────────────────────────────────────────────

export default function OffersPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Offer | null>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/admin/offers")
      .then((r) => r.json())
      .then((d) => setOffers(d.data ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const createOffer = async (data: any) => {
    const res = await fetch("/api/admin/offers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(await extractError(res));
    setShowCreate(false);
    load();
  };

  const updateOffer = async (id: string, data: any) => {
    const res = await fetch(`/api/admin/offers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(await extractError(res));
    setEditing(null);
    load();
  };

  const deleteOffer = async (id: string) => {
    if (!confirm("Удалить оффер?")) return;
    const res = await fetch(`/api/admin/offers/${id}`, { method: "DELETE" });
    if (!res.ok) { alert(await extractError(res)); return; }
    load();
  };

  const toggleActive = async (offer: Offer) => {
    await fetch(`/api/admin/offers/${offer.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !offer.isActive }),
    });
    load();
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Офферы</h1>
          <p className="text-sm text-gray-500 mt-0.5">Управление торговыми предложениями</p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setEditing(null); }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> Создать оффер
        </button>
      </div>

      {showCreate && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Новый оффер</h2>
          <OfferForm onSave={createOffer} onCancel={() => setShowCreate(false)} />
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-400">Загрузка…</div>
      ) : offers.length === 0 ? (
        <div className="text-center py-16 text-gray-400">Офферов пока нет</div>
      ) : (
        <div className="space-y-3">
          {offers.map((offer) => (
            <div key={offer.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {editing?.id === offer.id ? (
                <div className="p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Редактирование</h2>
                  <OfferForm
                    initial={editing}
                    onSave={(data) => updateOffer(offer.id, data)}
                    onCancel={() => setEditing(null)}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-4 p-4">
                  {/* Активность */}
                  <button onClick={() => toggleActive(offer)} className="shrink-0">
                    {offer.isActive
                      ? <ToggleRight className="w-7 h-7 text-blue-500" />
                      : <ToggleLeft className="w-7 h-7 text-gray-300" />}
                  </button>

                  {/* Инфо */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 text-sm">{offer.title}</span>
                      {!offer.isActive && (
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">скрыт</span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 flex-wrap">
                      <span className="text-blue-600 font-bold text-sm">{formatPrice(offer.price)}</span>
                      {offer.oldPrice && (
                        <span className="text-gray-400 text-xs line-through">{formatPrice(offer.oldPrice)}</span>
                      )}
                      {offer.tariff && (
                        <span className="flex items-center gap-1 text-xs text-purple-600">
                          <Tag className="w-3 h-3" /> {offer.tariff}
                        </span>
                      )}
                      {offer.accessDays ? (
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <Clock className="w-3 h-3" /> {offer.accessDays} дн.
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <Clock className="w-3 h-3" /> бессрочно
                        </span>
                      )}
                      {offer.courseIds.length > 0 && (
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <BookOpen className="w-3 h-3" /> {offer.courseIds.length} курс(ов)
                        </span>
                      )}
                      <span className="text-xs text-gray-400">{offer._count.orders} заказов</span>
                    </div>
                  </div>

                  {/* Действия */}
                  <div className="flex items-center gap-2 shrink-0">
                    {offer.publicSlug && (
                      <>
                        <a
                          href={`/offer/${offer.publicSlug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg transition-colors"
                          title="Открыть публичную страницу"
                        >
                          <LinkIcon className="w-3 h-3" /> /offer/
                          {offer.publicSlug}
                        </a>
                        <button
                          onClick={() => {
                            const url = `${
                              typeof window !== "undefined"
                                ? window.location.origin
                                : "https://prrv.tech"
                            }/offer/${offer.publicSlug}`;
                            navigator.clipboard
                              .writeText(url)
                              .then(() => toast.success("Ссылка скопирована"))
                              .catch(() => toast.error("Не удалось скопировать"));
                          }}
                          className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                          title="Скопировать публичную ссылку"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    <a
                      href={`/checkout/${offer.id}`}
                      target="_blank"
                      className="text-xs text-gray-400 hover:text-blue-600 transition-colors underline"
                    >
                      Чекаут ↗
                    </a>
                    <button
                      onClick={() => { setEditing(offer); setShowCreate(false); }}
                      className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteOffer(offer.id)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── CoursePicker — выбор курсов из существующих ───────────────────────────

function CoursePicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [courses, setCourses] = useState<CourseOption[] | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/admin/courses")
      .then((r) => r.json())
      .then((d) => {
        const list: CourseOption[] = (d.data ?? []).map((c: any) => ({
          id: c.id,
          title: c.title,
          slug: c.slug,
          isPublished: c.isPublished,
        }));
        setCourses(list);
      })
      .catch(() => setCourses([]));
  }, []);

  const byId = useMemo(() => {
    const map = new Map<string, CourseOption>();
    (courses ?? []).forEach((c) => map.set(c.id, c));
    return map;
  }, [courses]);

  const selected = value.map((id) => byId.get(id)).filter(Boolean) as CourseOption[];
  const orphanIds = value.filter((id) => !byId.has(id));

  const visible = (courses ?? []).filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return c.title.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q);
  });

  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((x) => x !== id));
    else onChange([...value, id]);
  };

  if (courses === null) {
    return <div className="text-xs text-gray-400">Загрузка списка курсов…</div>;
  }
  if (courses.length === 0) {
    return (
      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
        Курсов в системе ещё нет. Создай курс в разделе «Курсы» перед добавлением в оффер.
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Выбранные */}
      {(selected.length > 0 || orphanIds.length > 0) && (
        <div className="p-2 bg-blue-50 border-b border-blue-100 flex flex-wrap gap-1.5">
          {selected.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1 bg-white border border-blue-200 text-blue-700 text-xs px-2 py-1 rounded"
            >
              {c.title}
              <button
                type="button"
                onClick={() => toggle(c.id)}
                className="text-blue-400 hover:text-red-500"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {orphanIds.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 bg-white border border-red-200 text-red-700 text-xs px-2 py-1 rounded"
              title="Курс не найден — возможно, удалён. Удали его из оффера."
            >
              <span className="font-mono">{id.slice(0, 8)}…</span>
              <button
                type="button"
                onClick={() => toggle(id)}
                className="text-red-400 hover:text-red-600"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Поиск */}
      <div className="p-2 border-b border-gray-100 relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по названию…"
          className="w-full border border-gray-200 rounded-md pl-8 pr-2 py-1.5 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
        />
      </div>

      {/* Список курсов */}
      <div className="max-h-64 overflow-y-auto">
        {visible.length === 0 ? (
          <div className="p-3 text-center text-xs text-gray-400">Ничего не найдено</div>
        ) : (
          visible.map((c) => {
            const checked = value.includes(c.id);
            return (
              <label
                key={c.id}
                className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer transition-colors ${
                  checked ? "bg-blue-50" : "hover:bg-gray-50"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                    checked ? "bg-blue-600 border-blue-600" : "border-gray-300 bg-white"
                  }`}
                >
                  {checked && <Check className="w-3 h-3 text-white" />}
                </div>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(c.id)}
                  className="sr-only"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-gray-900 truncate">{c.title}</div>
                  <div className="text-[10px] text-gray-400 font-mono truncate">
                    /{c.slug}
                  </div>
                </div>
                {!c.isPublished && (
                  <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                    черновик
                  </span>
                )}
              </label>
            );
          })
        )}
      </div>

      <div className="px-3 py-2 border-t border-gray-100 bg-gray-50 text-[10px] text-gray-500">
        {selected.length} {pluralize(selected.length, ["курс выбран", "курса выбрано", "курсов выбрано"])}
        {orphanIds.length > 0 && (
          <span className="text-red-600 ml-2">
            · {orphanIds.length} ID не найдено
          </span>
        )}
      </div>
    </div>
  );
}

function pluralize(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}
