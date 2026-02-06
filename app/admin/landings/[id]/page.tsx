"use client";

import { useState, useEffect } from "react";
import LandingConstructor from "../LandingConstructor";

export default function EditLandingPage({ params }: { params: { id: string } }) {
  const [initialBlocks, setInitialBlocks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/landings/${params.id}/blocks`)
      .then(res => res.json())
      .then(data => {
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
      const res = await fetch(`/api/landings/${params.id}/blocks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocks }),
      });
      if (res.ok) {
        alert("Сохранено!");
      } else {
        alert("Ошибка сохранения");
      }
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
