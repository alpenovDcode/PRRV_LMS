"use client";

import React, { useState, useEffect, ElementType } from "react";

// --- SUBCOMPONENTS ---

interface AddBtnProps {
  icon: ElementType;
  label: string;
  onClick: () => void;
}

function AddBtn({ icon: Icon, label, onClick }: AddBtnProps) {
  return (
    <button onClick={onClick} className="flex flex-col items-center justify-center p-4 bg-white border rounded-xl shadow-sm hover:shadow-md hover:border-blue-300 transition-all gap-2 group">
      <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
         <Icon size={20} />
      </div>
      <span className="text-sm font-medium text-gray-700">{label}</span>
    </button>
  )
}

interface TabBtnProps {
  active: boolean;
  onClick: () => void;
  icon: ElementType;
  label: string;
}

function TabBtn({ active, onClick, icon: Icon, label }: TabBtnProps) {
   return (
      <button 
        onClick={onClick}
        className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors border-b-2
          ${active ? 'border-blue-500 text-blue-600 bg-blue-50/50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
      >
         <Icon size={16} /> {label}
      </button>
   )
}

interface InputProps {
  label: string;
  value: string | number | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
}

function Input({ label, value, onChange, placeholder }: InputProps) {
   return (
      <div>
         <label className="text-xs text-gray-500 block mb-1 font-medium">{label}</label>
         <input 
            className="w-full p-2 border rounded text-sm bg-white text-gray-900 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all placeholder:text-gray-400"
            value={value || ""}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
         />
      </div>
   )
}

interface TextAreaProps {
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
}

function TextArea({ label, value, onChange, placeholder }: TextAreaProps) {
   return (
      <div>
         <label className="text-xs text-gray-500 block mb-1 font-medium">{label}</label>
         <textarea 
            className="w-full p-2 border rounded text-sm bg-white text-gray-900 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all h-24 placeholder:text-gray-400"
            value={value || ""}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
         />
      </div>
   )
}
import { 
  Plus, Trash, ArrowUp, ArrowDown, Type, AlignJustify, Video, 
  LayoutTemplate, CheckSquare, MousePointerClick, Image as ImageIcon,
  Settings, Palette, GripVertical, ChevronRight, X, MessageSquare
} from "lucide-react";
import { v4 as uuidv4 } from 'uuid';
import RichTextEditor from "@/components/landing/RichTextEditor";
import HeroBlock from "@/components/landing/blocks/HeroBlock";
import FeaturesBlock from "@/components/landing/blocks/FeaturesBlock";
import ButtonBlock from "@/components/landing/blocks/ButtonBlock";


// --- TYPES ---
interface BlockDesign {
  bg: string;
  textColor: string;
  textSize?: "sm" | "base" | "lg" | "xl" | "2xl";
  padding: string;
  container: "fixed" | "fluid";
  textAlign: "left" | "center" | "right";
}

interface Block {
  id: string;
  type: "hero" | "text" | "features" | "video" | "form" | "button";
  content: any;
  design: BlockDesign;
  settings: any;
  orderIndex: number;
  responseTemplates?: string[]; // Legacy support for form
  lessonId?: string | null;     // Legacy support for form
}

const DEFAULT_DESIGN: BlockDesign = {
  bg: "bg-white",
  textColor: "text-gray-900",
  textSize: "base",
  padding: "py-12",
  container: "fixed",
  textAlign: "left"
};

const BG_OPTIONS = [
  { value: "bg-white", label: "White", class: "bg-white border" },
  { value: "bg-gray-50", label: "Light Gray", class: "bg-gray-50 border" },
  { value: "bg-blue-50", label: "Light Blue", class: "bg-blue-50 border" },
  { value: "bg-gray-900", label: "Dark", class: "bg-gray-900" },
  { value: "bg-blue-600", label: "Branded Blue", class: "bg-blue-600" },
];

export default function LandingConstructor({ 
  landingId, 
  initialBlocks,
  initialIsPublished,
  slug,
  initialSettings,
  onSave 
}: { 
  landingId: string, 
  initialBlocks: any[],
  initialSettings?: any,
  initialIsPublished: boolean,
  slug?: string,
  onSave: (blocks: Block[], isPublished: boolean, settings: any) => void
}) {
  // Migration logic for old blocks
  const normalizedBlocks = initialBlocks.map(b => ({
    ...b,
    id: b.id || uuidv4(),
    design: b.design || { ...DEFAULT_DESIGN },
    settings: b.settings || { utm: "", openAt: null }
  }));

  const [blocks, setBlocks] = useState<Block[]>(normalizedBlocks);
  const [isPublished, setIsPublished] = useState(initialIsPublished);
  const [settings, setSettings] = useState(initialSettings || {});
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [bitrixFunnels, setBitrixFunnels] = useState<any[]>([]);
  const [bitrixFields, setBitrixFields] = useState<any[]>([]);
  const [loadingFunnels, setLoadingFunnels] = useState(false);
  const [loadingFields, setLoadingFields] = useState(false);
  const [expandedFunnelId, setExpandedFunnelId] = useState<string | null>(null);

  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"content" | "design" | "settings">("content");
  const [lessons, setLessons] = useState<any[]>([]);

   // Fetch lessons for binding
  useEffect(() => {
     fetch('/api/admin/lessons/all')
        .then(res => res.json())
        .then(data => setLessons(Array.isArray(data) ? data : []))
        .catch(err => console.error("Failed to fetch lessons", err));
  }, []); // Added missing closure and dependency array for the first useEffect

  useEffect(() => {

     // Fetch Bitrix Fields
     setLoadingFields(true);
     fetch('/api/bitrix/fields/route')
        .then(res => res.json())
        .then(data => {
            if (Array.isArray(data)) setBitrixFields(data);
        })
        .catch(err => console.error("Failed to fetch Bitrix fields", err))
        .finally(() => setLoadingFields(false));
  }, []);

  const textSizeOptions = [
     { value: "sm", label: "Мелкий" },
     { value: "base", label: "Обычный" },
     { value: "lg", label: "Крупный" },
     { value: "xl", label: "Заголовок" },
     { value: "2xl", label: "Гигант" },
  ];

  const addBlock = (type: Block["type"] | "text_input") => {
    const realType = type === "text_input" ? "text" : type;
    const initialContent = type === "text_input" 
      ? { html: "<h2>Вопрос</h2><p>Ваш текст здесь...</p>", hasInput: true, inputLabel: "Ваш ответ" }
      : getInitialContent(realType);

    const newBlock: Block = {
      id: uuidv4(),
      type: realType,
      content: initialContent,
      design: { ...DEFAULT_DESIGN },
      settings: { openAt: null, utm: "" },
      orderIndex: blocks.length,
      responseTemplates: realType === "form" ? ["", "", "", "", ""] : [],
      lessonId: null
    };
    setBlocks([...blocks, newBlock]);
    setActiveBlockId(newBlock.id);
    setActiveTab("content");
  };

  const getInitialContent = (type: string) => {
    if (type === "hero") return { title: "Заголовок Прорыва", subtitle: "Краткое описание вашего предложения, которое цепляет.", ctaText: "Начать", ctaLink: "#form" };
    if (type === "text") return { html: "<h2>Заголовок секции</h2><p>Ваш текст здесь...</p>" };
    if (type === "features") return { columns: 3, features: [{ title: "Преимущество 1", description: "Описание", icon: "check" }, { title: "Преимущество 2", description: "Описание", icon: "zap" }, { title: "Преимущество 3", description: "Описание", icon: "star" }] };
    if (type === "button") return { text: "Нажать кнопку", link: "#", variant: "primary", size: "md" };
    if (type === "video") return { videoId: "", title: "" };
    if (type === "form") return { 
      fields: [
        { type: "text", label: "Имя", required: true },
        { type: "email", label: "Email", required: true },
        { type: "tel", label: "Телефон", required: true }
      ],
      buttonText: "Отправить заявку" 
    };
    return {};
  };

  const updateBlock = (id: string, updates: Partial<Block>) => {
    setBlocks(blocks.map(b => b.id === id ? { ...b, ...updates } : b));
  };
  
  const updateContent = (id: string, contentUpdates: any) => {
    setBlocks(blocks.map(b => b.id === id ? { ...b, content: { ...b.content, ...contentUpdates } } : b));
  };

  const updateDesign = (id: string, designUpdates: Partial<BlockDesign>) => {
    setBlocks(blocks.map(b => b.id === id ? { ...b, design: { ...b.design, ...designUpdates } } : b));
  };

  const removeBlock = (id: string) => {
    if (confirm("Удалить этот блок?")) {
      setBlocks(blocks.filter(b => b.id !== id));
      if (activeBlockId === id) setActiveBlockId(null);
    }
  };

  const moveBlock = (index: number, direction: -1 | 1) => {
    const newBlocks = [...blocks];
    if (index + direction < 0 || index + direction >= newBlocks.length) return;
    
    [newBlocks[index], newBlocks[index + direction]] = [newBlocks[index + direction], newBlocks[index]];
    setBlocks(newBlocks);
  };

  const activeBlock = blocks.find(b => b.id === activeBlockId);

  return (
    <div className="flex h-[calc(100vh-100px)] gap-4">
      {/* LEFT: Canvas / List */}
      <div className="flex-1 bg-gray-50 rounded-xl border overflow-y-auto p-8 flex flex-col items-center">
        <div className="w-full max-w-5xl space-y-2">
          {blocks.map((block, index) => (
            <div 
              key={block.id} 
              onClick={() => setActiveBlockId(block.id)}
              className={`relative group bg-white border-2 rounded-xl transition-all cursor-pointer overflow-hidden
                ${activeBlockId === block.id ? "border-blue-500 ring-4 ring-blue-500/10 shadow-lg z-10" : "border-transparent hover:border-gray-200 hover:shadow-md"}`}
            >
              <div className="pointer-events-none select-none relative">
                 {/* PREVIEW RENDERING */}
                 <div className="zoom-[0.8]">
                   {block.type === 'hero' && <HeroBlock content={block.content} design={block.design} />}
                   {block.type === 'features' && <FeaturesBlock content={block.content} design={block.design} />}
                   {block.type === 'button' && <ButtonBlock content={block.content} design={block.design} />}
                   {block.type === 'text' && (
                     <div className={`${block.design.bg} ${block.design.textColor} ${block.design.textSize ? `text-${block.design.textSize}` : ''} ${block.design.padding} text-${block.design.textAlign} prose max-w-none`}>
                        <div dangerouslySetInnerHTML={{ __html: block.content.html }} />
                        {block.content.hasInput && (
                           <div className="mt-4 p-4 border rounded-xl bg-gray-50/50">
                              <label className="block text-sm font-medium opacity-70 mb-2">{block.content.inputLabel || "Ваш ответ"}</label>
                              <div className="w-full h-24 bg-white border rounded px-3 py-2 text-sm text-gray-400 italic">
                                 Поле для ввода ответа (видят студенты)
                              </div>
                           </div>
                        )}
                     </div>
                   )}
                   {block.type === 'video' && (
                     <div className={`${block.design.bg} ${block.design.padding} rounded-xl`}>
                        {block.content.videoId ? (
                           <div className="aspect-video bg-black rounded-xl overflow-hidden shadow-lg mx-auto max-w-4xl relative">
                              <div className="absolute inset-0 flex items-center justify-center text-white/50 z-10 bg-black/20">
                                 <Video size={48} />
                              </div>
                              <iframe
                                 src={`https://customer-2h654e7z77942781.cloudflarestream.com/${block.content.videoId}/iframe?poster=https%3A%2F%2Fcustomer-2h654e7z77942781.cloudflarestream.com%2F${block.content.videoId}%2Fthumbnails%2Fthumbnail.jpg%3Ftime%3D%26height%3D600`}
                                 className="w-full h-full pointer-events-none"
                              ></iframe>
                           </div>
                        ) : (
                           <div className="aspect-video bg-gray-100 rounded-xl flex flex-col items-center justify-center text-gray-400 border-2 border-dashed">
                              <Video size={48} className="mb-2" />
                              <span className="text-sm">Введите Video ID в настройках</span>
                           </div>
                        )}
                     </div>
                   )}
                   {block.type === 'form' && (
                     <div className="p-8 text-center bg-gray-100 border-dashed border-2 rounded m-4">
                       <h3 className="font-bold">Форма заявки</h3>
                       <p className="text-sm text-gray-500">Поля формы будут здесь</p>
                     </div>
                   )}
                 </div>

                 {/* OVERLAY ACTIONS */}
                 <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto">
                    <button onClick={(e) => { e.stopPropagation(); moveBlock(index, -1); }} className="p-1 bg-white border rounded shadow hover:bg-gray-50"><ArrowUp size={14}/></button>
                    <button onClick={(e) => { e.stopPropagation(); moveBlock(index, 1); }} className="p-1 bg-white border rounded shadow hover:bg-gray-50"><ArrowDown size={14}/></button>
                    <button onClick={(e) => { e.stopPropagation(); removeBlock(block.id); }} className="p-1 bg-red-50 text-red-600 border border-red-100 rounded shadow hover:bg-red-100"><Trash size={14}/></button>
                 </div>
                 
                 <div className="absolute top-2 left-2 bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100">
                    {block.type.toUpperCase()}
                 </div>
              </div>
            </div>
          ))}

          {/* ADD BUTTONS IN CANVAS */}
          <div className="py-8 flex justify-center">
             <div className="grid grid-cols-3 gap-3">
               <AddBtn icon={LayoutTemplate} label="Hero" onClick={() => addBlock("hero")} />
               <AddBtn icon={Type} label="Текст" onClick={() => addBlock("text")} />
               <AddBtn icon={MessageSquare} label="Текст с ответом" onClick={() => addBlock("text_input")} />
               <AddBtn icon={CheckSquare} label="Преимущества" onClick={() => addBlock("features")} />
               <AddBtn icon={MousePointerClick} label="Кнопка" onClick={() => addBlock("button")} />
               <AddBtn icon={AlignJustify} label="Форма" onClick={() => addBlock("form")} />
               <AddBtn icon={Video} label="Видео" onClick={() => addBlock("video")} />
             </div>
          </div>
        </div>
      </div>

      {/* RIGHT: Sidebar / Inspector */}
      <div className="w-[350px] bg-white border-l rounded-xl flex flex-col">
         {/* HEADER */}
         <div className="p-4 border-b space-y-3">
            <div className="flex items-center justify-between">
               <h2 className="font-bold text-gray-800">
                 {activeBlock ? "Настройки блока" : "Конструктор"}
               </h2>
               {slug && (
                  <a 
                    href={`/l/${slug}`} 
                    target="_blank" 
                    className="p-1.5 text-gray-400 hover:text-blue-600 border rounded-lg hover:bg-gray-50 transition-colors"
                    title="Предпросмотр на сайте"
                  >
                    <ImageIcon size={16} />
                  </a>
               )}
            </div>
            
            <div className="grid grid-cols-2 gap-2">
               <button 
                 onClick={() => {
                    const newStatus = !isPublished;
                    setIsPublished(newStatus);
                    onSave(blocks, newStatus, settings);
                 }}
                 className={`px-3 py-2 text-sm rounded-lg font-medium border transition-all flex items-center justify-center gap-2 ${
                    isPublished 
                      ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100" 
                      : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                 }`}
                 title={isPublished ? "Снять с публикации" : "Опубликовать"}
               >
                 <div className={`w-2 h-2 rounded-full ${isPublished ? "bg-green-500" : "bg-gray-400"}`} />
                 {isPublished ? "Опубликовано" : "Черновик"}
               </button>
               <button 
                 onClick={() => onSave(blocks, isPublished, settings)}
                 className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 hover:shadow-md transition-all flex items-center justify-center gap-2"
               >
                 Сохранить
               </button>
            </div>
            
            {/* GLOBAL SETTINGS BUTTON */}
            <button 
               onClick={() => setShowSettingsModal(true)}
               className="w-full py-2 flex items-center justify-center gap-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-gray-900 transition-colors"
            >
               <Settings size={16} />
               Настройки интеграций
            </button>
         </div>

         {/* CONTENT (if active block) */}
         {activeBlock ? (
           <>
              <div className="flex border-b">
                 <TabBtn active={activeTab === 'content'} onClick={() => setActiveTab('content')} icon={Settings} label="Контент" />
                 <TabBtn active={activeTab === 'design'} onClick={() => setActiveTab('design')} icon={Palette} label="Дизайн" />
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                 {activeTab === 'content' && (
                    <div className="space-y-4">
                       {/* HERO EDITOR */}
                       {activeBlock.type === 'hero' && (
                         <>
                           <Input label="Заголовок" value={activeBlock.content.title} onChange={v => updateContent(activeBlock.id, { title: v })} />
                           <TextArea label="Подзаголовок" value={activeBlock.content.subtitle} onChange={v => updateContent(activeBlock.id, { subtitle: v })} />
                           <Input label="Текст кнопки" value={activeBlock.content.ctaText} onChange={v => updateContent(activeBlock.id, { ctaText: v })} />
                           <Input label="Ссылка кнопки" value={activeBlock.content.ctaLink} onChange={v => updateContent(activeBlock.id, { ctaLink: v })} />
                           <Input label="URL фоновой картинки" value={activeBlock.content.backgroundImage || ""} onChange={v => updateContent(activeBlock.id, { backgroundImage: v })} placeholder="https://..." />
                         </>
                       )}

                       {/* TEXT EDITOR */}
                       {activeBlock.type === 'text' && (
                         <div className="space-y-4">
                            <div className="space-y-2">
                               <label className="text-xs font-semibold text-gray-500">Текст</label>
                               <RichTextEditor 
                                  content={activeBlock.content.html} 
                                  onChange={html => updateContent(activeBlock.id, { html })}
                               />
                            </div>

                            <div className="pt-4 border-t space-y-3">
                               <label className="flex items-center gap-2 cursor-pointer select-none">
                                  <input 
                                     type="checkbox" 
                                     className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                     checked={activeBlock.content.hasInput || false} 
                                     onChange={e => updateContent(activeBlock.id, { hasInput: e.target.checked })} 
                                  />
                                  <span className="text-sm font-medium text-gray-700">Поле для ответа</span>
                               </label>
                               
                               {activeBlock.content.hasInput && (
                                  <>
                                     <Input 
                                        label="Заголовок поля (Label)" 
                                        value={activeBlock.content.inputLabel} 
                                        onChange={v => updateContent(activeBlock.id, { inputLabel: v })} 
                                        placeholder="Например: Ваш ответ"
                                     />
                                     
                                     <label className="flex items-center gap-2 cursor-pointer select-none mt-2">
                                        <input 
                                           type="checkbox" 
                                           className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                           checked={activeBlock.content.isKeywordField || false} 
                                           onChange={e => updateContent(activeBlock.id, { isKeywordField: e.target.checked })} 
                                        />
                                        <span className="text-sm font-medium text-gray-700">
                                           Сохранять как ключевое слово
                                        </span>
                                     </label>
                                     
                                     {activeBlock.content.isKeywordField && (
                                        <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
                                           💡 Ответы пользователей будут накапливаться в их профиле
                                        </div>
                                     )}
                                  </>
                               )}
                            </div>
                         </div>
                       )}

                       {/* FEATURES EDITOR */}
                       {activeBlock.type === 'features' && (
                         <>
                            <div className="flex gap-2 bg-gray-50 p-1 rounded border">
                               {[2, 3, 4].map(n => (
                                 <button key={n} onClick={() => updateContent(activeBlock.id, { columns: n })}
                                   className={`flex-1 text-xs py-1 rounded ${activeBlock.content.columns === n ? 'bg-white shadow text-blue-600 font-bold' : 'text-gray-500'}`}>
                                   {n} кол.
                                 </button>
                               ))}
                            </div>
                            <div className="space-y-4 pt-2">
                               {activeBlock.content.features.map((feat: any, idx: number) => (
                                 <div key={idx} className="p-3 border rounded bg-gray-50 relative group">
                                    <button onClick={() => {
                                       const newF = [...activeBlock.content.features];
                                       newF.splice(idx, 1);
                                       updateContent(activeBlock.id, { features: newF });
                                    }} className="absolute top-2 right-2 text-red-400 hover:text-red-600 p-1"><X size={12}/></button>
                                    
                                    <h4 className="text-xs font-bold text-gray-400 mb-2">Элемент #{idx + 1}</h4>
                                    <Input label="Заголовок" value={feat.title} onChange={v => {
                                       const newF = [...activeBlock.content.features];
                                       newF[idx].title = v;
                                       updateContent(activeBlock.id, { features: newF });
                                    }} />
                                    <TextArea label="Описание" value={feat.description} onChange={v => {
                                       const newF = [...activeBlock.content.features];
                                       newF[idx].description = v;
                                       updateContent(activeBlock.id, { features: newF });
                                    }} />
                                    <div className="mt-2">
                                       <label className="text-xs text-gray-500">Иконка</label>
                                       <select 
                                          className="w-full text-sm border rounded p-1"
                                          value={feat.icon}
                                          onChange={e => {
                                             const newF = [...activeBlock.content.features];
                                             newF[idx].icon = e.target.value;
                                             updateContent(activeBlock.id, { features: newF });
                                          }}
                                       >
                                          <option value="check">Check</option>
                                          <option value="zap">Zap</option>
                                          <option value="star">Star</option>
                                          <option value="shield">Shield</option>
                                       </select>
                                    </div>
                                 </div>
                               ))}
                               <button 
                                 onClick={() => updateContent(activeBlock.id, { features: [...activeBlock.content.features, { title: "Новая фича", description: "Описание", icon: "check" }] })}
                                 className="w-full py-2 text-sm text-blue-600 border border-blue-200 bg-blue-50 rounded hover:bg-blue-100"
                               >
                                 + Добавить элемент
                               </button>
                            </div>
                         </>
                       )}

                       {/* BUTTON EDITOR */}
                       {activeBlock.type === 'button' && (
                          <>
                             <Input label="Текст кнопки" value={activeBlock.content.text} onChange={v => updateContent(activeBlock.id, { text: v })} />
                             <Input label="Ссылка" value={activeBlock.content.link} onChange={v => updateContent(activeBlock.id, { link: v })} />
                             <div className="grid grid-cols-2 gap-2">
                                <div>
                                   <label className="text-xs text-gray-500 block mb-1">Стиль</label>
                                   <select className="w-full text-sm border rounded p-2" value={activeBlock.content.variant} onChange={e => updateContent(activeBlock.id, { variant: e.target.value })}>
                                      <option value="primary">Основная</option>
                                      <option value="secondary">Вторичная</option>
                                      <option value="outline">Контур</option>
                                   </select>
                                </div>
                                <div>
                                   <label className="text-xs text-gray-500 block mb-1">Размер</label>
                                   <select className="w-full text-sm border rounded p-2" value={activeBlock.content.size} onChange={e => updateContent(activeBlock.id, { size: e.target.value })}>
                                      <option value="sm">Мелкая</option>
                                      <option value="md">Средняя</option>
                                      <option value="lg">Крупная</option>
                                   </select>
                                </div>
                             </div>
                          </>
                       )}

                        {/* VIDEO EDITOR */}
                        {activeBlock.type === 'video' && (
                           <>
                              <div className="bg-blue-50 p-3 rounded text-sm text-blue-800 mb-4">
                                 Вставьте ID видео из Cloudflare Stream.
                              </div>
                              <Input label="Video ID" value={activeBlock.content.videoId} onChange={v => updateContent(activeBlock.id, { videoId: v })} placeholder="e.g. 52494..." />
                              <Input label="Заголовок (необязательно)" value={activeBlock.content.title} onChange={v => updateContent(activeBlock.id, { title: v })} />
                           </>
                        )}

                       {/* FORM LEGACY EDITOR (Partial) */}
                        {activeBlock.type === 'form' && (
                          <div className="space-y-4">
                             <div className="space-y-3">
                                <label className="text-xs font-semibold text-gray-500">Поля формы</label>
                                {activeBlock.content.fields.map((field: any, idx: number) => (
                                   <div key={idx} className="p-3 border rounded bg-gray-50 relative group space-y-2">
                                      <div className="flex justify-between items-center">
                                         <span className="text-xs font-bold text-gray-400">Поле #{idx + 1}</span>
                                         <button 
                                            onClick={() => {
                                               const newFields = [...activeBlock.content.fields];
                                               newFields.splice(idx, 1);
                                               updateContent(activeBlock.id, { fields: newFields });
                                            }}
                                            className="text-red-400 hover:text-red-600 p-1"
                                         >
                                            <X size={14}/>
                                         </button>
                                      </div>
                                      
                                      <Input 
                                         label="Название поля (Label)" 
                                         value={field.label} 
                                         onChange={v => {
                                            const newFields = [...activeBlock.content.fields];
                                            newFields[idx].label = v;
                                            updateContent(activeBlock.id, { fields: newFields });
                                         }} 
                                      />
                                      
                                      <div className="flex gap-2">
                                         <div className="flex-1">
                                            <label className="text-xs text-gray-500 block mb-1">Тип</label>
                                            <select 
                                               className="w-full text-sm border rounded p-2"
                                               value={field.type}
                                               onChange={e => {
                                                  const newFields = [...activeBlock.content.fields];
                                                  newFields[idx].type = e.target.value;
                                                  updateContent(activeBlock.id, { fields: newFields });
                                               }}
                                            >
                                               <option value="text">Текст</option>
                                               <option value="email">Email</option>
                                               <option value="tel">Телефон</option>
                                               <option value="number">Число</option>
                                               <option value="date">Дата</option>
                                            </select>
                                         </div>
                                         <div className="flex items-end pb-2">
                                            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                                               <input 
                                                  type="checkbox" 
                                                  checked={field.required}
                                                  onChange={(e) => {
                                                     const newFields = [...activeBlock.content.fields];
                                                     newFields[idx].required = e.target.checked;
                                                     updateContent(activeBlock.id, { fields: newFields });
                                                  }}
                                                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                               />
                                               <span className="text-gray-600 text-xs">Обязательное</span>
                                            </label>
                                         </div>
                                      </div>
                                   </div>
                                ))}
                                
                                <button 
                                   onClick={() => updateContent(activeBlock.id, { 
                                      fields: [...activeBlock.content.fields, { type: "text", label: "Новое поле", required: false }] 
                                   })}
                                   className="w-full py-2 text-sm text-blue-600 border border-blue-200 bg-blue-50 rounded hover:bg-blue-100 flex items-center justify-center gap-2"
                                >
                                   <Plus size={14} /> Добавить поле
                                </button>
                             </div>

                             <Input label="Текст кнопки" value={activeBlock.content.buttonText} onChange={v => updateContent(activeBlock.id, { buttonText: v })} />
                             
                             <div className="space-y-2 pt-4 border-t">
                                <label className="text-xs font-semibold text-gray-500">Привязать к уроку (AI Проверка)</label>
                                <select 
                                  className="w-full p-2 border rounded text-sm"
                                  value={activeBlock.lessonId || ""}
                                  onChange={e => updateBlock(activeBlock.id, { lessonId: e.target.value || null })}
                                >
                                   <option value="">-- Без привязки --</option>
                                   {lessons.map(l => (
                                     <option key={l.id} value={l.id}>{l.title}</option>
                                   ))}
                                </select>
                              </div>
                           
                              <div className="space-y-4 pt-4 border-t">
                                 <h4 className="text-xs font-bold text-gray-500 uppercase">Настройки полей Bitrix</h4>
                                 {activeBlock.content.fields.map((field: any, idx: number) => (
                                    <div key={idx} className="flex flex-col gap-1">
                                       <label className="text-xs text-gray-600 font-medium truncate">
                                          {field.label} ({field.type})
                                       </label>
                                       <select 
                                          className="w-full text-sm border rounded p-1.5"
                                          value={field.bitrixFieldId || ""}
                                          onChange={(e) => {
                                             const newFields = [...activeBlock.content.fields];
                                             newFields[idx].bitrixFieldId = e.target.value;
                                             updateContent(activeBlock.id, { fields: newFields });
                                          }}
                                       >
                                          <option value="">-- Auto / Default --</option>
                                          {bitrixFields.map((f: any) => (
                                             <option key={f.id} value={f.id}>{f.label} ({f.id})</option>
                                          ))}
                                       </select>
                                    </div>
                                 ))}
                              </div>
                           </div>
                        )}
                    </div>
                 )}

                 {activeTab === 'design' && (
                    <div className="space-y-6">
                       {/* TEXT SIZE CONTROL */}
                       <div>
                          <label className="text-xs font-bold text-gray-400 block mb-3 uppercase">Размер текста</label>
                          <select 
                             className="w-full border rounded p-2 text-sm"
                             value={activeBlock.design.textSize || "base"}
                             onChange={e => updateDesign(activeBlock.id, { textSize: e.target.value as any })}
                          >
                             {textSizeOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                             ))}
                          </select>
                       </div>

                       <div>
                          <label className="text-xs font-bold text-gray-400 block mb-3 uppercase">Фон секции</label>
                          <div className="grid grid-cols-5 gap-2">
                             {BG_OPTIONS.map(opt => (
                                <button
                                  key={opt.value}
                                  onClick={() => updateDesign(activeBlock.id, { bg: opt.value })}
                                  className={`h-8 w-8 rounded-full ${opt.class} ${activeBlock.design.bg === opt.value ? 'ring-2 ring-offset-2 ring-blue-500' : ''}`}
                                  title={opt.label}
                                />
                             ))}
                          </div>
                       </div>

                       <div>
                          <label className="text-xs font-bold text-gray-400 block mb-3 uppercase">Разметка</label>
                          <div className="space-y-3">
                             <div className="flex items-center justify-between">
                                <span className="text-sm">Ширина</span>
                                <div className="flex bg-gray-100 p-0.5 rounded text-xs">
                                   <button onClick={() => updateDesign(activeBlock.id, { container: 'fixed' })} className={`px-2 py-1 rounded ${activeBlock.design.container === 'fixed' ? 'bg-white shadow' : ''}`}>Fixed</button>
                                   <button onClick={() => updateDesign(activeBlock.id, { container: 'fluid' })} className={`px-2 py-1 rounded ${activeBlock.design.container === 'fluid' ? 'bg-white shadow' : ''}`}>Fluid</button>
                                </div>
                             </div>
                             <div className="flex items-center justify-between">
                                <span className="text-sm">Выравнивание</span>
                                <div className="flex bg-gray-100 p-0.5 rounded text-xs">
                                   <button onClick={() => updateDesign(activeBlock.id, { textAlign: 'left' })} className={`px-2 py-1 rounded ${activeBlock.design.textAlign === 'left' ? 'bg-white shadow' : ''}`}>Left</button>
                                   <button onClick={() => updateDesign(activeBlock.id, { textAlign: 'center' })} className={`px-2 py-1 rounded ${activeBlock.design.textAlign === 'center' ? 'bg-white shadow' : ''}`}>Center</button>
                                </div>
                             </div>
                          </div>
                       </div>
                       
                        <div>
                          <label className="text-xs font-bold text-gray-400 block mb-3 uppercase">Отступы (Высота)</label>
                          <div className="flex bg-gray-100 p-0.5 rounded text-xs">
                             {['py-0', 'py-8', 'py-12', 'py-20', 'py-32'].map(p => (
                               <button 
                                 key={p} 
                                 onClick={() => updateDesign(activeBlock.id, { padding: p })} 
                                 className={`flex-1 py-1 rounded ${activeBlock.design.padding === p ? 'bg-white shadow text-blue-600 font-bold' : 'text-gray-500'}`}
                               >
                                 {p.replace('py-', '')}
                               </button>
                             ))}
                          </div>
                       </div>
                       
                        <div>
                          <label className="text-xs font-bold text-gray-400 block mb-3 uppercase">Цвет текста</label>
                          <select 
                             className="w-full border rounded p-2 text-sm"
                             value={activeBlock.design.textColor}
                             onChange={e => updateDesign(activeBlock.id, { textColor: e.target.value })}
                          >
                             <option value="text-gray-900">Темный / Черный</option>
                             <option value="text-white">Белый</option>
                             <option value="text-gray-500">Серый</option>
                             <option value="text-blue-600">Синий</option>
                          </select>
                       </div>
                    </div>
                 )}
              </div>
              
              <div className="pt-6 mt-6 border-t">
                 <button 
                    onClick={() => removeBlock(activeBlock.id)}
                    className="w-full flex items-center justify-center gap-2 py-3 text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                 >
                    <Trash size={16} />
                    Удалить этот блок
                 </button>
              </div>
           </>
         ) : (
           <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-6 text-center">
              <MousePointerClick size={48} className="mb-4 opacity-20" />
              <p>Выберите блок слева, чтобы изменить его контент и дизайн.</p>
           </div>
         )}
      </div>

      {/* SETTINGS MODAL */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
           <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between p-4 border-b bg-gray-50">
                 <h3 className="font-bold text-lg flex items-center gap-2">
                    <Settings size={20} className="text-gray-500" />
                    Настройки лендинга
                 </h3>
                 <button onClick={() => setShowSettingsModal(false)} className="p-1 hover:bg-gray-200 rounded-lg transition">
                    <X size={20} />
                 </button>
              </div>
              
              <div className="p-6 space-y-6">
                 {/* BITRIX INTEGRATION */}
                 <div className="space-y-4">
                    <div className="flex items-center justify-between">
                       <h4 className="font-semibold text-gray-800">Интеграция с Битрикс24</h4>
                       <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            className="sr-only peer" 
                            checked={settings?.bitrix?.enabled || false}
                            onChange={e => setSettings({ 
                               ...settings, 
                               bitrix: { ...settings?.bitrix, enabled: e.target.checked } 
                            })}
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                       </label>
                    </div>

                    {settings?.bitrix?.enabled && (
                       <div className="space-y-3 p-4 bg-blue-50 border border-blue-100 rounded-xl animate-in fade-in slide-in-from-top-2">
                          <div>
                             <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Target Stage ID (Сделка)</label>
                             <div className="flex gap-2">
                                <input 
                                   className="w-full p-2 border rounded text-sm font-mono"
                                   placeholder="C14:NEW (Default)"
                                   value={settings?.bitrix?.targetStageId || ""}
                                   onChange={e => setSettings({
                                      ...settings,
                                      bitrix: { ...settings?.bitrix, targetStageId: e.target.value }
                                   })}
                                />
                                <button 
                                   onClick={async () => {
                                      if (bitrixFunnels.length > 0) {
                                         // Already loaded, just toggle visibility or scroll?
                                         // For now just re-fetch to be safe or do nothing
                                      } else {
                                         setLoadingFunnels(true);
                                         try {
                                            const res = await fetch('/api/bitrix/funnels');
                                            const data = await res.json();
                                            if (Array.isArray(data)) {
                                               setBitrixFunnels(data);
                                            } else {
                                               alert("Ошибка загрузки данных из Bitrix");
                                            }
                                         } catch (e) {
                                            alert("Ошибка сети");
                                         } finally {
                                            setLoadingFunnels(false);
                                         }
                                      }
                                   }}
                                   className="px-3 py-2 bg-white border border-blue-200 text-blue-600 rounded hover:bg-blue-50 text-xs font-bold whitespace-nowrap flex items-center gap-1 transition-colors"
                                   title="Загрузить список воронок из Bitrix24"
                                >
                                   {loadingFunnels ? "Загрузка..." : "Синхронизировать"}
                                </button>
                             </div>
                             <p className="text-xs text-gray-500 mt-1">
                                ID стадии, куда будет попадать сделка. Если пусто, используется системный `BITRIX_SOURCE_STAGE_ID`.
                             </p>
                          </div>

                          {/* FUNNELS TABLE */}
                          {(bitrixFunnels.length > 0 || loadingFunnels) && (
                             <div className="mt-4 border rounded-lg bg-white overflow-hidden">
                                <div className="bg-gray-100 px-3 py-2 text-xs font-bold text-gray-500 border-b flex justify-between items-center">
                                   <span>Доступные воронки ({bitrixFunnels.length})</span>
                                   <button onClick={() => setBitrixFunnels([])} className="text-gray-400 hover:text-gray-600"><X size={14}/></button>
                                </div>
                                <div className="max-h-60 overflow-y-auto">
                                   {loadingFunnels ? (
                                      <div className="p-4 text-center text-sm text-gray-500">Загрузка данных...</div>
                                   ) : (
                                      <div className="divide-y">
                                         {bitrixFunnels.map(funnel => (
                                            <div key={funnel.id} className="text-sm">
                                               <button 
                                                  onClick={() => setExpandedFunnelId(expandedFunnelId === funnel.id ? null : funnel.id)}
                                                  className="w-full flex items-center justify-between p-3 hover:bg-gray-50 text-left"
                                               >
                                                  <span className="font-medium text-gray-800">{funnel.name || `Воронка #${funnel.id}`}</span>
                                                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{funnel.stages.length} стадий</span>
                                               </button>
                                               
                                               {expandedFunnelId === funnel.id && (
                                                  <div className="bg-gray-50 p-2 pl-4 space-y-1 border-t shadow-inner">
                                                     {funnel.stages.map((stage: any) => (
                                                        <div key={stage.id} className="flex justify-between items-center group">
                                                           <span className="text-xs text-gray-600">{stage.name}</span>
                                                           <button 
                                                              onClick={() => {
                                                                 setSettings({
                                                                    ...settings,
                                                                    bitrix: { ...settings?.bitrix, targetStageId: stage.id }
                                                                 });
                                                              }}
                                                              className="text-xs font-mono bg-white border px-1.5 py-0.5 rounded text-blue-600 hover:bg-blue-50 hover:border-blue-300 transition-colors cursor-pointer"
                                                              title="Нажмите, чтобы выбрать"
                                                           >
                                                              {stage.id}
                                                           </button>
                                                        </div>
                                                     ))}
                                                  </div>
                                               )}
                                            </div>
                                         ))}
                                      </div>
                                   )}
                                </div>
                             </div>
                          )}
                       </div>
                    )}
                 </div>
              </div>

              <div className="p-4 border-t bg-gray-50 flex justify-end">
                 <button 
                   onClick={() => setShowSettingsModal(false)}
                   className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition"
                 >
                    Готово
                 </button>
              </div>
           </div>
        </div>
      )}

    </div>
  );
}


