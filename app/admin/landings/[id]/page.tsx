"use client";

import { useState, useEffect } from "react";
import LandingConstructor from "../LandingConstructor";
import { apiClient } from "@/lib/api-client";

export default function EditLandingPage({ params }: { params: { id: string } }) {
  const [initialBlocks, setInitialBlocks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get(`/landings/${params.id}/blocks`)
      .then(({ data }) => {
        // Ensure responseTemplates exists (migration fallback)
        const formatted = data.map((b: any) => ({
           ...b,
           responseTemplates: b.responseTemplates || ["", "", "", "", ""]
        }));
        setInitialBlocks(formatted);
        setLoading(false);
      });
  }, [params.id]);

  const handleSave = async (blocks: any[]) => {
    try {
      await apiClient.post(`/landings/${params.id}/blocks`, { blocks });
      alert("Сохранено!");
    } catch (e) {
      alert("Ошибка сети");
    }
  };

  if (loading) return <div>Загрузка...</div>;

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="mb-6 flex items-center justify-between">
         <h1 className="text-2xl font-bold">Редактор лендинга</h1>
      </div>
      <LandingConstructor 
        landingId={params.id} 
        initialBlocks={initialBlocks} 
        onSave={handleSave} 
      />
    </div>
  );
}
