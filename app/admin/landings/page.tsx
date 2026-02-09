"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, Globe, Eye, MoreHorizontal, Copy, Trash, BarChart, X } from "lucide-react";
import { apiClient } from "@/lib/api-client";

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
           <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
              <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                 <h3 className="font-bold text-lg">Статистика: {selectedLanding.title}</h3>
                 <button onClick={() => setStatsOpen(false)} className="text-gray-400 hover:text-gray-600">
                    <X size={20} />
                 </button>
              </div>
              
              <div className="p-6">
                 {currentStats ? (
                    <div className="space-y-6">
                       <div className="grid grid-cols-2 gap-4">
                          <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 text-center">
                             <div className="text-3xl font-bold text-blue-600">{currentStats.views}</div>
                             <div className="text-sm text-blue-800 font-medium opacity-70">Просмотры</div>
                          </div>
                          <div className="p-4 bg-purple-50 rounded-xl border border-purple-100 text-center">
                             <div className="text-3xl font-bold text-purple-600">{currentStats.submissions}</div>
                             <div className="text-sm text-purple-800 font-medium opacity-70">Заявки</div>
                          </div>
                       </div>
                       
                       <div className="p-4 bg-gray-50 rounded-xl text-center">
                          <div className="text-xl font-bold text-gray-800">
                             {currentStats.views > 0 
                               ? ((currentStats.submissions / currentStats.views) * 100).toFixed(1) 
                               : 0}%
                          </div>
                          <div className="text-xs uppercase font-bold text-gray-400 tracking-wider">Конверсия</div>
                       </div>
                    </div>
                 ) : (
                    <div className="py-12 flex justify-center">
                       <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                 )}
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
