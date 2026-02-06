"use client";

import { useState } from "react";
import { Plus, Trash, ArrowUp, ArrowDown, Type, AlignJustify, Video } from "lucide-react";

interface Block {
  id?: string;
  type: "text" | "video" | "form";
  content: any;
  settings: any;
  orderIndex: number;
  responseTemplates?: string[];
}

export default function LandingConstructor({ 
  landingId, 
  initialBlocks,
  onSave 
}: { 
  landingId: string, 
  initialBlocks: Block[],
  onSave: (blocks: Block[]) => void
}) {
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [activeTab, setActiveTab] = useState<number | null>(null);

  const addBlock = (type: "text" | "video" | "form") => {
    const newBlock: Block = {
      type,
      content: getInitialContent(type),
      settings: { openAt: null, utm: "" },
      orderIndex: blocks.length,
      responseTemplates: type === "form" ? ["", "", "", "", ""] : [],
    };
    setBlocks([...blocks, newBlock]);
    setActiveTab(blocks.length);
  };

  const getInitialContent = (type: string) => {
    if (type === "text") return { html: "<h2>Заголовок</h2><p>Текст...</p>" };
    if (type === "video") return { videoId: "", title: "" };
    if (type === "form") return { 
      fields: [
        { type: "text", label: "Имя", required: true },
        { type: "email", label: "Email", required: true },
        { type: "tel", label: "Телефон", required: true }
      ],
      buttonText: "Отправить" 
    };
    return {};
  };

  const updateBlock = (index: number, updates: Partial<Block>) => {
    const newBlocks = [...blocks];
    newBlocks[index] = { ...newBlocks[index], ...updates };
    setBlocks(newBlocks);
  };

  const removeBlock = (index: number) => {
    setBlocks(blocks.filter((_, i) => i !== index));
  };

  const save = () => {
    onSave(blocks);
  };

  return (
    <div className="grid grid-cols-12 gap-6">
      {/* Sidebar / Tools */}
      <div className="col-span-3 bg-white p-4 rounded-xl border h-fit sticky top-4">
        <h3 className="font-semibold mb-4">Добавить блок</h3>
        <div className="space-y-2">
          <button onClick={() => addBlock("text")} className="w-full flex items-center gap-2 p-3 bg-gray-50 hover:bg-gray-100 rounded-lg border">
            <Type size={18} /> Текст
          </button>
          <button onClick={() => addBlock("video")} className="w-full flex items-center gap-2 p-3 bg-gray-50 hover:bg-gray-100 rounded-lg border">
            <Video size={18} /> Видео
          </button>
          <button onClick={() => addBlock("form")} className="w-full flex items-center gap-2 p-3 bg-gray-50 hover:bg-gray-100 rounded-lg border">
            <AlignJustify size={18} /> Форма
          </button>
        </div>
        
        <div className="mt-8 pt-4 border-t">
          <button onClick={save} className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700">
            Сохранить изменения
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="col-span-9 space-y-4">
        {blocks.map((block, index) => (
          <div key={index} className="bg-white rounded-xl border shadow-sm relative group">
            {/* Controls */}
            <div className="absolute right-4 top-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => removeBlock(index)} className="p-2 bg-red-50 text-red-600 rounded hover:bg-red-100">
                <Trash size={16} />
              </button>
            </div>

            <div className="p-6">
              <div className="uppercase text-xs font-bold text-gray-400 mb-4">{block.type} BLOCK</div>
              
              {/* Editors */}
              {block.type === "text" && (
                <textarea 
                  className="w-full p-3 border rounded-lg h-32 font-mono text-sm"
                  value={block.content.html}
                  onChange={(e) => updateBlock(index, { content: { html: e.target.value } })}
                />
              )}

              {block.type === "video" && (
                <div>
                   <input 
                      placeholder="ID видео (Cloudflare)"
                      className="w-full p-2 border rounded mb-2"
                      value={block.content.videoId}
                      onChange={(e) => updateBlock(index, { content: { ...block.content, videoId: e.target.value } })}
                   />
                </div>
              )}

              {block.type === "form" && (
                <div>
                  <div className="mb-4 p-3 bg-blue-50 text-blue-800 text-sm rounded">
                    Поля <b>Имя</b> и <b>Email</b> обязательны и добавляются автоматически. Можно добавить только кастомные поля.
                  </div>
                  
                  {/* Response Templates Editor */}
                  <div className="mt-6 border-t pt-4">
                     <h4 className="font-semibold text-sm mb-3">Шаблоны авто-ответа (случайный выбор)</h4>
                     <div className="space-y-2">
                        {block.responseTemplates?.map((tpl, tplIndex) => (
                           <input
                             key={tplIndex}
                             className="w-full p-2 border rounded text-sm"
                             placeholder={`Вариант ответа #${tplIndex + 1}`}
                             value={tpl}
                             onChange={(e) => {
                                const newTpls = [...(block.responseTemplates || [])];
                                newTpls[tplIndex] = e.target.value;
                                updateBlock(index, { responseTemplates: newTpls });
                             }}
                           />
                        ))}
                     </div>
                  </div>
                </div>
              )}
              
              {/* Common Settings */}
              <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-4">
                 <div>
                    <label className="text-xs text-gray-500">Дата открытия (UTC)</label>
                    <input 
                      type="datetime-local"
                      className="w-full p-2 border rounded text-sm"
                      value={block.settings.openAt || ""}
                      onChange={(e) => updateBlock(index, { settings: { ...block.settings, openAt: e.target.value } })}
                    />
                 </div>
                 <div>
                    <label className="text-xs text-gray-500">UTM Метка</label>
                    <input 
                      type="text"
                      className="w-full p-2 border rounded text-sm"
                      placeholder="campaign_source"
                      value={block.settings.utm || ""}
                      onChange={(e) => updateBlock(index, { settings: { ...block.settings, utm: e.target.value } })}
                    />
                 </div>
              </div>

            </div>
          </div>
        ))}
        
        {blocks.length === 0 && (
           <div className="text-center py-20 bg-gray-50 border border-dashed rounded-xl text-gray-400">
              Добавьте первый блок слева
           </div>
        )}
      </div>
    </div>
  );
}
