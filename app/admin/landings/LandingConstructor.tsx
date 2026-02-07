"use client";

import { useState, useEffect } from "react";
import { Plus, Trash, ArrowUp, ArrowDown, Type, AlignJustify, Video } from "lucide-react";

interface Block {
  id?: string;
  type: "text" | "video" | "form";
  content: any;
  settings: any;
  orderIndex: number;
  responseTemplates?: string[];
  // Text block specific
  hasInput?: boolean; 
  inputLabel?: string;
  lessonId?: string | null;
}

export default function LandingConstructor({ 
  landingId, 
  initialBlocks,
  initialIsPublished,
  onSave 
}: { 
  landingId: string, 
  initialBlocks: Block[],
  initialIsPublished: boolean,
  onSave: (blocks: Block[], isPublished: boolean) => void
}) {
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [isPublished, setIsPublished] = useState(initialIsPublished);
  const [lessons, setLessons] = useState<any[]>([]);

  // Fetch lessons for binding
  useEffect(() => {
     fetch('/api/admin/lessons/all')
        .then(res => res.json())
        .then(data => setLessons(Array.isArray(data) ? data : []))
        .catch(err => console.error("Failed to fetch lessons", err));
  }, []);

  const addBlock = (type: "text" | "video" | "form") => {
    const newBlock: Block = {
      type,
      content: getInitialContent(type),
      settings: { openAt: null, utm: "" },
      orderIndex: blocks.length,
      responseTemplates: type === "form" ? ["", "", "", "", ""] : [],
      lessonId: null
    };
    setBlocks([...blocks, newBlock]);
  };

  const getInitialContent = (type: string) => {
    if (type === "text") return { html: "<h2>Заголовок</h2><p>Текст...</p>", hasInput: false, inputLabel: "Ваш ответ" };
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
    onSave(blocks, isPublished);
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
        
        <div className="mt-8 pt-4 border-t space-y-4">
          <div className="flex items-center gap-2 px-1">
             <input 
               type="checkbox" 
               id="publish" 
               className="w-5 h-5"
               checked={isPublished}
               onChange={(e) => setIsPublished(e.target.checked)}
             />
             <label htmlFor="publish" className="font-medium">Опубликовать</label>
          </div>
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
                <div className="space-y-4">
                  <textarea 
                    className="w-full p-3 border rounded-lg h-32 font-mono text-sm"
                    value={block.content.html}
                    onChange={(e) => updateBlock(index, { content: { ...block.content, html: e.target.value } })}
                  />
                  
                  <div className="flex items-start gap-4 p-3 bg-gray-50 rounded-lg border">
                      <div className="flex items-center gap-2 mt-2">
                        <input 
                          type="checkbox"
                          id={`input-${index}`}
                          className="w-4 h-4"
                          checked={block.content.hasInput || false}
                          onChange={(e) => updateBlock(index, { content: { ...block.content, hasInput: e.target.checked } })}
                        />
                        <label htmlFor={`input-${index}`} className="text-sm font-medium">
                           Добавить поле для ответа
                        </label>
                      </div>

                      {block.content.hasInput && (
                         <div className="flex-1">
                            <label className="text-xs text-gray-500 block mb-1">Текст лейбла</label>
                            <input 
                               className="w-full p-2 border rounded text-sm bg-white"
                               value={block.content.inputLabel || "Ваш ответ"}
                               onChange={(e) => updateBlock(index, { content: { ...block.content, inputLabel: e.target.value } })}
                            />
                         </div>
                      )}
                  </div>
                </div>
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
