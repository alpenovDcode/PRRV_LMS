"use client";

import { useState, useEffect, use } from "react";
import LandingConstructor from "../LandingConstructor";
import { apiClient } from "@/lib/api-client";

export default function EditLandingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [initialBlocks, setInitialBlocks] = useState([]);
  const [isPublished, setIsPublished] = useState(false);
  const [initialSettings, setInitialSettings] = useState({});
  const [slug, setSlug] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
           setSlug(landingRes.data.slug);
           setInitialSettings(landingRes.data.settings || {});
        }

        setLoading(false);
    });
  }, [id]);

  const handleSave = async (blocks: any[], published: boolean, settings: any) => {
    try {
      await Promise.all([
         apiClient.post(`/landings/${id}/blocks`, { blocks }),
         apiClient.patch(`/landings/${id}`, { isPublished: published, settings })
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
        initialSettings={initialSettings}
        slug={slug}
        onSave={handleSave} 
      />
    </div>
  );
}
