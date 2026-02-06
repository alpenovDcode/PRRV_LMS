"use client";

import { useState, useEffect, use } from "react";
import LandingConstructor from "../LandingConstructor";
import { apiClient } from "@/lib/api-client";

export default function EditLandingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [initialBlocks, setInitialBlocks] = useState([]);
  const [isPublished, setIsPublished] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Fetch metadata (published status)
    apiClient.get(`/landings`) // Optimization: fetch specific, but list is cached/fast enough for now or assume passed. 
    // actually we need specific. Let's create GET /api/landings/[id] later if needed.
    // For now, let's assume we can add GET to [id] route I just created.
    // Wait, I didn't add GET to [id] route yet. I only added PATCH.
    // Let's rely on list or just add GET.
    // Let's add GET to [id] route as well to be clean.
    
    Promise.all([
       apiClient.get(`/landings/${id}/blocks`),
       apiClient.get(`/landings/${id}`)
    ]).then(([blocksRes, landingRes]) => {
         // Blocks
         const data = blocksRes.data;
         const formatted = data.map((b: any) => ({
           ...b,
           responseTemplates: b.responseTemplates || ["", "", "", "", ""]
        }));
        setInitialBlocks(formatted);
        
        // Metadata
        if (landingRes.data) {
           setIsPublished(landingRes.data.isPublished);
        }

        setLoading(false);
    });
  }, [id]);

  // FIXME: Need to fetch isPublished to show correct initial state. 
  // I will add GET to /api/landings/[id] in next tool call and use it here.
  
  const handleSave = async (blocks: any[], published: boolean) => {
    try {
      await Promise.all([
         apiClient.post(`/landings/${id}/blocks`, { blocks }),
         apiClient.patch(`/landings/${id}`, { isPublished: published })
      ]);
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
        landingId={id} 
        initialBlocks={initialBlocks} 
        initialIsPublished={isPublished}
        onSave={handleSave} 
      />
    </div>
  );
}
