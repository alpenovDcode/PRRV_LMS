"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, Globe, Eye, Copy, Trash, BarChart, X, Send, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";

interface LandingPage {
  id: string;
  title: string;
  slug: string;
  isPublished: boolean;
  createdAt: string;
}

interface BitrixFunnel {
  id: string;
  name: string;
  stages: { id: string; name: string }[];
}

interface BitrixField {
  id: string;
  label: string;
  type: string;
}

type SendStatus = "idle" | "loading" | "success" | "error";

export default function LandingsPage() {
  const [landings, setLandings] = useState<LandingPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [statsOpen, setStatsOpen] = useState(false);
  const [currentStats, setCurrentStats] = useState<any>(null);
  const [selectedLanding, setSelectedLanding] = useState<LandingPage | null>(null);

  // CRM send modal state
  const [crmModalOpen, setCrmModalOpen] = useState(false);
  const [funnels, setFunnels] = useState<BitrixFunnel[]>([]);
  const [fields, setFields] = useState<BitrixField[]>([]);
  const [funnelsLoading, setFunnelsLoading] = useState(false);
  const [selectedFunnelId, setSelectedFunnelId] = useState("");
  const [selectedFieldId, setSelectedFieldId] = useState("");
  const [sendStatus, setSendStatus] = useState<SendStatus>("idle");
  const [sendResult, setSendResult] = useState<{ sent: number; total: number; errors: any[] } | null>(null);
  const [errorsExpanded, setErrorsExpanded] = useState(false);

  useEffect(() => {
    fetchLandings();
  }, []);

  const fetchLandings = async () => {
    try {
      const { data } = await apiClient.get("/landings");
      setLandings(data);
    } catch (error) {
      console.error("Failed to fetch landings", error);
    } finally {
      setLoading(false);
    }
  };

  const createLanding = async () => {
    const title = prompt("Введите название лендинга:");
    if (!title) return;

    const slug = prompt("Введите URL (slug):", title.toLowerCase().replace(/ /g, "-"));
    if (!slug) return;

    try {
      await apiClient.post("/landings", { title, slug });
      fetchLandings();
    } catch (error: any) {
      alert(error.response?.data?.error || error.message || "Ошибка сети или сервера");
    }
  };

  const deleteLanding = async (id: string) => {
    if (!confirm("Вы уверены?")) return;
    try {
      await apiClient.delete(`/landings/${id}`);
      setLandings(landings.filter((l) => l.id !== id));
    } catch (error) {
      alert("Ошибка удаления");
    }
  };

  const openStats = async (landing: LandingPage) => {
    setSelectedLanding(landing);
    setStatsOpen(true);
    setCurrentStats(null);
    try {
      const { data } = await apiClient.get(`/admin/landings/${landing.id}/stats`);
      setCurrentStats(data);
    } catch (error) {
      alert("Не удалось загрузить статистику");
    }
  };

  const openCrmModal = async () => {
    setCrmModalOpen(true);
    setSelectedFunnelId("");
    setSelectedFieldId("");
    setSendStatus("idle");
    setSendResult(null);
    setErrorsExpanded(false);

    if (funnels.length === 0) {
      setFunnelsLoading(true);
      try {
        const [funnelsRes, fieldsRes] = await Promise.all([
          apiClient.get("/bitrix/funnels"),
          apiClient.get("/bitrix/fields"),
        ]);
        setFunnels(funnelsRes.data);
        setFields(fieldsRes.data);
      } catch (e) {
        console.error("Failed to load Bitrix data", e);
      } finally {
        setFunnelsLoading(false);
      }
    }
  };

  const handleSendToCrm = async () => {
    if (!selectedLanding || !selectedFunnelId) return;
    setSendStatus("loading");
    setSendResult(null);
    try {
      const { data } = await apiClient.post(
        `/admin/landings/${selectedLanding.id}/send-to-crm`,
        { funnelId: selectedFunnelId, fieldId: selectedFieldId || null }
      );
      setSendResult(data);
      setSendStatus("success");
    } catch (e: any) {
      setSendStatus("error");
    }
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Лендинги</h1>
        <button
          onClick={createLanding}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700"
        >
          <Plus size={20} />
          Создать
        </button>
      </div>

      <div className="grid gap-4">
        {landings.map((landing) => (
          <div
            key={landing.id}
            className="bg-white p-4 rounded-xl shadow-sm border flex justify-between items-center"
          >
            <div>
              <div className="flex items-center gap-3">
                <h3 className="font-semibold text-lg">{landing.title}</h3>
                {landing.isPublished ? (
                  <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                    Опубликован
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                    Черновик
                  </span>
                )}
              </div>
              <div className="flex gap-4 mt-1 text-sm text-gray-500">
                <a
                  href={`/l/${landing.slug}`}
                  target="_blank"
                  className="flex items-center gap-1 hover:text-blue-600"
                >
                  <Globe size={14} /> /l/{landing.slug}
                </a>
                <span>Создан: {new Date(landing.createdAt).toLocaleDateString()}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href={`/admin/landings/${landing.id}`}
                className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg"
                title="Редактировать"
              >
                <Eye size={20} />
              </Link>
              <button
                onClick={() => openStats(landing)}
                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                title="Статистика"
              >
                <BarChart size={20} />
              </button>
              <button
                onClick={() => deleteLanding(landing.id)}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                title="Удалить"
              >
                <Trash size={20} />
              </button>
            </div>
          </div>
        ))}

        {landings.length === 0 && !loading && (
          <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-xl border border-dashed">
            Нет созданных лендингов
          </div>
        )}
      </div>

      {/* STATS MODAL */}
      {statsOpen && selectedLanding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-6xl shadow-2xl overflow-hidden my-8 flex flex-col max-h-[90vh]">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50 flex-shrink-0">
              <h3 className="font-bold text-lg">Статистика: {selectedLanding.title}</h3>
              <div className="flex items-center gap-2">
                {/* Export CSV */}
                <button
                  onClick={() => {
                    if (!currentStats?.list?.length) return;
                    const items = currentStats.list;
                    const allKeys = new Set<string>();
                    items.forEach((item: any) => {
                      const content = item.content || {};
                      const { _answers, ...otherProps } = content;
                      Object.keys(otherProps).forEach((k) => allKeys.add(k));
                      if (_answers) {
                        if (Array.isArray(_answers)) {
                          _answers.forEach((_, i) => allKeys.add(`Answer ${i + 1}`));
                        } else if (typeof _answers === "object") {
                          Object.keys(_answers).forEach((k) => allKeys.add(k));
                        }
                      }
                    });
                    const dynamicHeaders = Array.from(allKeys);
                    const headers = ["ID", "Date", "User Name", "User Email", ...dynamicHeaders];
                    const csvRows = [headers.join(",")];
                    items.forEach((item: any) => {
                      const content = item.content || {};
                      const { _answers, ...otherProps } = content;
                      const row = [
                        item.id,
                        new Date(item.createdAt).toLocaleString("ru-RU"),
                        (item.user?.fullName || "Guest").replace(/,/g, ""),
                        (item.user?.email || "-").replace(/,/g, ""),
                      ];
                      dynamicHeaders.forEach((header) => {
                        let val = "";
                        if (otherProps[header] !== undefined) {
                          val = otherProps[header];
                        } else if (_answers && !Array.isArray(_answers) && typeof _answers === "object" && _answers[header] !== undefined) {
                          val = _answers[header];
                        } else if (_answers && Array.isArray(_answers) && header.startsWith("Answer ")) {
                          const idx = parseInt(header.split(" ")[1]) - 1;
                          if (_answers[idx] !== undefined) val = _answers[idx];
                        }
                        const stringVal = (typeof val === "object" ? JSON.stringify(val) : String(val)).replace(/"/g, '""');
                        row.push(`"${stringVal}"`);
                      });
                      csvRows.push(row.join(","));
                    });
                    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.setAttribute("href", url);
                    link.setAttribute("download", `submissions_${selectedLanding.slug}_${new Date().toISOString().slice(0, 10)}.csv`);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                  title="Скачать CSV"
                >
                  <Copy size={16} />
                  Экспорт CSV
                </button>

                {/* Send to CRM */}
                <button
                  onClick={openCrmModal}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
                  title="Отправить заявки в CRM воронку"
                >
                  <Send size={16} />
                  В CRM
                </button>

                <button onClick={() => setStatsOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {currentStats ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 text-center">
                      <div className="text-3xl font-bold text-blue-600">{currentStats.views}</div>
                      <div className="text-sm text-blue-800 font-medium opacity-70">Просмотры</div>
                    </div>
                    <div className="p-4 bg-purple-50 rounded-xl border border-purple-100 text-center">
                      <div className="text-3xl font-bold text-purple-600">{currentStats.submissions}</div>
                      <div className="text-sm text-purple-800 font-medium opacity-70">Заявки</div>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 text-center">
                      <div className="text-xl font-bold text-gray-800">
                        {currentStats.views > 0
                          ? ((currentStats.submissions / currentStats.views) * 100).toFixed(1)
                          : 0}%
                      </div>
                      <div className="text-xs uppercase font-bold text-gray-400 tracking-wider">Конверсия</div>
                    </div>
                  </div>

                  <div className="mt-8">
                    <h4 className="font-bold text-gray-800 mb-4">Последние заявки</h4>
                    <div className="bg-white rounded-xl border overflow-hidden shadow-sm">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-gray-100 text-gray-500 font-medium">
                            <tr>
                              <th className="p-3 w-32">Дата</th>
                              <th className="p-3 w-48">Пользователь</th>
                              <th className="p-3">Ответы / Данные формы</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {currentStats.list && currentStats.list.length > 0 ? (
                              currentStats.list.map((sub: any) => {
                                const content = sub.content || {};
                                const { name, email, _answers, ...otherProps } = content;
                                const answers = _answers || [];
                                const displayName = sub.user?.fullName || name || "Без имени";
                                const displayEmail = sub.user?.email || email || "-";

                                return (
                                  <tr key={sub.id} className="hover:bg-gray-50 transition-colors align-top">
                                    <td className="p-3 text-gray-500 whitespace-nowrap">
                                      {new Date(sub.createdAt).toLocaleString("ru-RU")}
                                    </td>
                                    <td className="p-3">
                                      <div className="font-medium text-gray-900">{displayName}</div>
                                      <div className="text-xs text-gray-500">{displayEmail}</div>
                                      {sub.user && sub.user.id && (
                                        <Badge variant="outline" className="mt-1 text-[10px] h-4 px-1">
                                          ID: {sub.user.id.slice(0, 4)}...
                                        </Badge>
                                      )}
                                    </td>
                                    <td className="p-3">
                                      <div className="grid gap-2">
                                        {(() => {
                                          const answersList = Array.isArray(answers)
                                            ? answers
                                            : typeof answers === "object" && answers !== null
                                            ? Object.values(answers)
                                            : [];
                                          if (answersList.length > 0) {
                                            return (
                                              <div className="bg-blue-50/50 p-2 rounded border border-blue-100/50">
                                                <div className="text-xs font-semibold text-blue-700 mb-1">Ответы на вопросы:</div>
                                                <ul className="list-disc list-inside space-y-0.5">
                                                  {answersList.map((ans: any, idx: number) => (
                                                    <li key={idx} className="text-sm text-gray-700 marker:text-blue-400">
                                                      {typeof ans === "object" ? JSON.stringify(ans) : String(ans)}
                                                    </li>
                                                  ))}
                                                </ul>
                                              </div>
                                            );
                                          }
                                          return null;
                                        })()}
                                        {Object.entries(otherProps).length > 0 && (
                                          <div className="space-y-1">
                                            {Object.entries(otherProps).map(([key, value]) => (
                                              <div key={key} className="text-sm flex flex-col sm:flex-row sm:gap-2">
                                                <span className="text-gray-500 font-medium min-w-[100px]">{key}:</span>
                                                <span className="text-gray-800 break-words whitespace-pre-wrap">
                                                  {typeof value === "object" ? JSON.stringify(value) : String(value)}
                                                </span>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                        {((!Array.isArray(answers) && (!answers || typeof answers !== "object" || Object.keys(answers).length === 0)) ||
                                          (Array.isArray(answers) && answers.length === 0)) &&
                                          Object.keys(otherProps).length === 0 && (
                                            <span className="text-gray-400 italic text-sm">Нет дополнительных данных</span>
                                          )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })
                            ) : (
                              <tr>
                                <td colSpan={3} className="p-8 text-center text-gray-400 italic">
                                  Заявок пока нет
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-24 flex justify-center items-center">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                  <span className="ml-3 text-gray-500">Загрузка статистики...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CRM SEND MODAL */}
      {crmModalOpen && selectedLanding && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-5 border-b flex justify-between items-center">
              <div>
                <h3 className="font-bold text-lg">Обновить сделки в CRM</h3>
                <p className="text-sm text-gray-500 mt-0.5">{selectedLanding.title}</p>
              </div>
              <button
                onClick={() => setCrmModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {funnelsLoading ? (
                <div className="flex items-center justify-center py-8 gap-2 text-gray-500">
                  <Loader2 size={20} className="animate-spin" />
                  Загрузка данных Bitrix24...
                </div>
              ) : sendStatus === "success" && sendResult ? (
                <div className="py-4 space-y-3">
                  <div className="flex items-center gap-2 text-green-700 font-semibold">
                    <CheckCircle size={20} />
                    Готово!
                  </div>
                  <p className="text-sm text-gray-600">
                    Успешно обновлено: <strong>{sendResult.sent}</strong> из{" "}
                    <strong>{sendResult.total}</strong> сделок.
                  </p>
                  {sendResult.errors.length > 0 && (
                    <div className="bg-red-50 border border-red-100 rounded-lg text-sm text-red-700 overflow-hidden">
                      <button
                        onClick={() => setErrorsExpanded((v) => !v)}
                        className="w-full flex items-center justify-between px-3 py-2 font-medium hover:bg-red-100 transition-colors"
                      >
                        <span>Не обновлено: {sendResult.errors.length}</span>
                        <span className="text-xs">{errorsExpanded ? "▲ скрыть" : "▼ показать"}</span>
                      </button>
                      {errorsExpanded && (
                        <div className="max-h-40 overflow-y-auto px-3 pb-2 space-y-0.5 border-t border-red-100">
                          {sendResult.errors.map((e: any, i: number) => (
                            <p key={i} className="text-xs py-0.5">• {e.error || "Неизвестная ошибка"}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <button
                    onClick={() => setCrmModalOpen(false)}
                    className="w-full mt-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium"
                  >
                    Закрыть
                  </button>
                </div>
              ) : sendStatus === "error" ? (
                <div className="py-4 space-y-3">
                  <div className="flex items-center gap-2 text-red-600 font-semibold">
                    <AlertCircle size={20} />
                    Ошибка отправки
                  </div>
                  <p className="text-sm text-gray-600">Не удалось отправить заявки. Проверьте настройки Bitrix24.</p>
                  <button
                    onClick={() => setSendStatus("idle")}
                    className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium"
                  >
                    Попробовать снова
                  </button>
                </div>
              ) : (
                <>
                  {/* Funnel select */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Воронка <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={selectedFunnelId}
                      onChange={(e) => setSelectedFunnelId(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">— Выберите воронку —</option>
                      {funnels.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Field select */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Поле для ответов <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={selectedFieldId}
                      onChange={(e) => setSelectedFieldId(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">— Выберите поле —</option>
                      {fields.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label} ({f.id})
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-400 mt-1">
                      Ответы из заявки будут записаны в выбранное поле существующей сделки
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => setCrmModalOpen(false)}
                      className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
                    >
                      Отмена
                    </button>
                    <button
                      onClick={handleSendToCrm}
                      disabled={!selectedFunnelId || !selectedFieldId || sendStatus === "loading"}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                    >
                      {sendStatus === "loading" ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          Отправка...
                        </>
                      ) : (
                        <>
                          <Send size={16} />
                          Отправить в CRM
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
