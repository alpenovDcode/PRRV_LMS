"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, Globe, Eye, MoreHorizontal, Copy, Trash, BarChart, X } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";

interface LandingPage {
  id: string;
  title: string;
  slug: string;
  isPublished: boolean;
  createdAt: string;
}

export default function LandingsPage() {
  const [landings, setLandings] = useState<LandingPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [statsOpen, setStatsOpen] = useState(false);
  const [currentStats, setCurrentStats] = useState<any>(null);
  const [selectedLanding, setSelectedLanding] = useState<LandingPage | null>(null);

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
    setCurrentStats(null); // Reset
    try {
       const { data } = await apiClient.get(`/admin/landings/${landing.id}/stats`);
       setCurrentStats(data);
    } catch (error) {
       alert("Не удалось загрузить статистику");
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
                <span>
                  Создан: {new Date(landing.createdAt).toLocaleDateString()}
                </span>
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
                 <button onClick={() => setStatsOpen(false)} className="text-gray-400 hover:text-gray-600">
                    <X size={20} />
                 </button>
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
                    
                       {/* Table Section */}
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
                                        // Extract standard fields to avoid duplication or identifying contact info
                                        const { name, email, _answers, ...otherProps } = content;
                                        const answers = _answers || [];
                                        
                                        // Fallbacks for user info
                                        const displayName = sub.user?.fullName || name || "Без имени";
                                        const displayEmail = sub.user?.email || email || "-";

                                        return (
                                          <tr key={sub.id} className="hover:bg-gray-50 transition-colors align-top">
                                             <td className="p-3 text-gray-500 whitespace-nowrap">
                                                {new Date(sub.createdAt).toLocaleString('ru-RU')}
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
                                                   {/* Show Answers Array if exists */}
                                                   {Array.isArray(answers) && answers.length > 0 && (
                                                      <div className="bg-blue-50/50 p-2 rounded border border-blue-100/50">
                                                         <div className="text-xs font-semibold text-blue-700 mb-1">Ответы на вопросы:</div>
                                                         <ul className="list-disc list-inside space-y-0.5">
                                                            {answers.map((ans: any, idx: number) => (
                                                               <li key={idx} className="text-sm text-gray-700 marker:text-blue-400">
                                                                  {typeof ans === 'object' ? JSON.stringify(ans) : String(ans)}
                                                               </li>
                                                            ))}
                                                         </ul>
                                                      </div>
                                                   )}

                                                   {/* Show Other Properties */}
                                                   {Object.entries(otherProps).length > 0 && (
                                                      <div className="space-y-1">
                                                         {Object.entries(otherProps).map(([key, value]) => (
                                                            <div key={key} className="text-sm flex flex-col sm:flex-row sm:gap-2">
                                                               <span className="text-gray-500 font-medium min-w-[100px]">{key}:</span>
                                                               <span className="text-gray-800 break-words whitespace-pre-wrap">
                                                                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                                               </span>
                                                            </div>
                                                         ))}
                                                      </div>
                                                   )}

                                                   {/* Fallback if empty */}
                                                   {!Array.isArray(answers) && Object.keys(otherProps).length === 0 && (
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
    </div>
  );
}
