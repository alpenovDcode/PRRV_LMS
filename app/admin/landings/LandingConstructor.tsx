"use client";

import React, { useState, useEffect, ElementType } from "react";
import { 
  Plus, Trash, ArrowUp, ArrowDown, Type, AlignJustify, Video, 
  LayoutTemplate, CheckSquare, MousePointerClick, Image as ImageIcon,
  Settings, Palette, GripVertical, ChevronRight, X, MessageSquare, RefreshCw,
  Clock, Star as StarIcon, CreditCard, Minus, Copy, ExternalLink, Eye, Layout
} from "lucide-react";
import { v4 as uuidv4 } from 'uuid';
import RichTextEditor from "@/components/landing/RichTextEditor";
import HeroBlock from "@/components/landing/blocks/HeroBlock";
import FeaturesBlock from "@/components/landing/blocks/FeaturesBlock";
import ButtonBlock from "@/components/landing/blocks/ButtonBlock";
import TimerBlock from "@/components/landing/blocks/TimerBlock";
import ReviewsBlock from "@/components/landing/blocks/ReviewsBlock";
import PricingBlock from "@/components/landing/blocks/PricingBlock";
import DividerBlock from "@/components/landing/blocks/DividerBlock";

// --- SUBCOMPONENTS ---

interface AddBtnProps {
  icon: ElementType;
  label: string;
  onClick: () => void;
}

function AddBtn({ icon: Icon, label, onClick }: AddBtnProps) {
  return (
    <button onClick={onClick} className="flex flex-col items-center justify-center p-4 bg-white border rounded-2xl shadow-sm hover:shadow-md hover:border-blue-300 transition-all gap-2 group">
      <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
         <Icon size={20} />
      </div>
      <span className="text-[11px] font-bold text-gray-500 uppercase tracking-tight">{label}</span>
    </button>
  )
}

function TabBtn({ active, onClick, icon: Icon, label }: { active: boolean, onClick: () => void, icon: ElementType, label: string }) {
   return (
      <button 
        onClick={onClick}
        className={`flex flex-col items-center justify-center gap-1 w-full py-4 transition-all
          ${active ? 'text-blue-600 border-r-4 border-blue-600 bg-blue-50/50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
      >
         <Icon size={22} />
         <span className="text-[10px] font-bold uppercase">{label}</span>
      </button>
   )
}

function Input({ label, value, onChange, placeholder, type = "text" }: { label: string, value: string | number | undefined, onChange: (value: string) => void, placeholder?: string, type?: string }) {
   return (
      <div>
         <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">{label}</label>
         <input 
            type={type}
            className="w-full p-3 border rounded-xl text-sm bg-gray-50 text-gray-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-gray-400"
            value={value || ""}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
         />
      </div>
   )
}

function TextArea({ label, value, onChange, placeholder }: { label: string, value: string | undefined, onChange: (value: string) => void, placeholder?: string }) {
   return (
      <div>
         <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">{label}</label>
         <textarea 
            className="w-full p-3 border rounded-xl text-sm bg-gray-50 text-gray-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all h-28 placeholder:text-gray-400"
            value={value || ""}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
         />
      </div>
   )
}

// --- CONSTANTS ---

const PALETTES = [
  { id: 'arctic', name: 'Arctic', bg: 'bg-white', textColor: 'text-gray-900', accent: '#3B82F6', preview: '#3B82F6' },
  { id: 'onyx', name: 'Onyx', bg: 'bg-gray-900', textColor: 'text-white', accent: '#6366F1', preview: '#111827' },
  { id: 'sage', name: 'Sage', bg: 'bg-emerald-50', textColor: 'text-emerald-950', accent: '#059669', preview: '#10B981' },
  { id: 'sunset', name: 'Sunset', bg: 'bg-orange-50', textColor: 'text-orange-950', accent: '#EA580C', preview: '#F97316' },
  { id: 'royal', name: 'Royal', bg: 'bg-slate-900', textColor: 'text-white', accent: '#F59E0B', preview: '#1E293B' },
];

const DEFAULT_DESIGN = {
  bg: "bg-white",
  textColor: "text-gray-900",
  textSize: "base",
  padding: "py-20",
  container: "fixed",
  textAlign: "center",
  accentColor: "#3B82F6"
};

const BG_OPTIONS = [
  { value: "bg-white", label: "White", class: "bg-white border" },
  { value: "bg-gray-50", label: "Light Gray", class: "bg-gray-50 border" },
  { value: "bg-gray-900", label: "Dark", class: "bg-gray-900" },
  { value: "bg-blue-900", label: "Deep Blue", class: "bg-blue-900" },
  { value: "bg-emerald-950", label: "Forest", class: "bg-emerald-950" },
];

// --- TYPES ---
interface Block {
  id: string;
  type: string;
  content: any;
  design: any;
  settings: any;
  orderIndex: number;
  lessonId?: string | null;
}

export default function LandingConstructor({ 
  landingId, 
  initialBlocks,
  initialIsPublished,
  slug,
  initialSettings,
  onSave 
}: any) {
  // Migration logic
  const normalizedBlocks = initialBlocks.map((b: any) => ({
    ...b,
    id: b.id || uuidv4(),
    design: b.design || { ...DEFAULT_DESIGN },
    settings: b.settings || { utm: "", openAt: null }
  }));

  const [blocks, setBlocks] = useState<Block[]>(normalizedBlocks);
  const [isPublished, setIsPublished] = useState(initialIsPublished);
  const [settings, setSettings] = useState(initialSettings || { palette: PALETTES[0] });
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [activeNavTab, setActiveNavTab] = useState<"blocks" | "page" | "design">("blocks");
  const [activeInspectorTab, setActiveInspectorTab] = useState<"content" | "style">("content");
  
  const [lessons, setLessons] = useState<any[]>([]);
  const [bitrixFields, setBitrixFields] = useState<any[]>([]);
  const [loadingFields, setLoadingFields] = useState(false);

  useEffect(() => {
    fetch('/api/admin/lessons/all').then(r => r.json()).then(d => setLessons(Array.isArray(d) ? d : []));
    fetch('/api/bitrix/fields').then(r => r.json()).then(d => { if (Array.isArray(d)) setBitrixFields(d); });
  }, []);

  const addBlock = (type: string) => {
    const newBlock: Block = {
      id: uuidv4(),
      type: type === 'text_input' ? 'text' : type,
      content: getInitialContent(type),
      design: { ...DEFAULT_DESIGN, bg: settings.palette?.bg || 'bg-white', textColor: settings.palette?.textColor || 'text-gray-900', accentColor: settings.palette?.accent || '#3B82F6' },
      settings: { openAt: null },
      orderIndex: blocks.length
    };
    setBlocks([...blocks, newBlock]);
    setActiveBlockId(newBlock.id);
    setActiveInspectorTab("content");
  };

  const getInitialContent = (type: string) => {
    if (type === "hero") return { title: "Заголовок Прорыва", subtitle: "Краткое описание вашего предложения, которое цепляет.", ctaText: "Начать", ctaLink: "#form", backgroundImage: "", bgOverlay: 0.5 };
    if (type === "text") return { html: "<h2>Заголовок секции</h2><p>Ваш текст здесь...</p>", hasInput: false };
    if (type === "text_input") return { html: "<h2>Вопрос</h2><p>Опишите ваш опыт...</p>", hasInput: true, inputLabel: "Ваш ответ" };
    if (type === "features") return { title: "Наши преимущества", columns: 3, items: [{ title: "Скорость", desc: "Быстрый результат", icon: "zap" }, { title: "Качество", desc: "Проверено временем", icon: "star" }, { title: "Поддержка", desc: "Мы всегда рядом", icon: "shield" }] };
    if (type === "button") return { text: "Начать обучение", link: "#form", variant: "primary", size: "lg" };
    if (type === "video") return { videoId: "", title: "" };
    if (type === "form") return { fields: [{ type: "text", label: "Имя", required: true }, { type: "tel", label: "Телефон", required: true }], buttonText: "Отправить заявку" };
    if (type === "timer") return { title: "До конца акции осталось:", deadline: new Date(Date.now() + 86400000).toISOString() };
    if (type === "reviews") return { title: "Отзывы наших учеников", items: [{ name: "Александр", role: "Студент", text: "Лучший курс в моей жизни!" }, { name: "Мария", role: "Дизайнер", text: "Очень много практики и полезных фишек." }] };
    if (type === "pricing") return { title: "Тарифы обучения", plans: [{ name: "Базовый", price: "9900", period: "месяц", features: ["Доступ к урокам", "Чат студентов"], cta: "Выбрать" }, { name: "ПРО", price: "19900", period: "курс", features: ["Все из Базового", "Проверка заданий", "Сертификат"], cta: "Хочу ПРО", highlighted: true }] };
    if (type === "divider") return { style: "line", spacing: "md" };
    return {};
  };

  const updateBlock = (id: string, updates: any) => setBlocks(blocks.map(b => b.id === id ? { ...b, ...updates } : b));
  const updateContent = (id: string, contentUpdates: any) => setBlocks(blocks.map(b => b.id === id ? { ...b, content: { ...b.content, ...contentUpdates } } : b));
  const updateDesign = (id: string, designUpdates: any) => setBlocks(blocks.map(b => b.id === id ? { ...b, design: { ...b.design, ...designUpdates } } : b));

  const applyPalette = (palette: any) => {
    setSettings({ ...settings, palette });
    setBlocks(blocks.map(b => ({
      ...b,
      design: { ...b.design, bg: palette.bg, textColor: palette.textColor, accentColor: palette.accent }
    })));
  };

  const activeBlock = blocks.find(b => b.id === activeBlockId);

  return (
    <div className="flex bg-[#F8FAFC] h-[calc(100vh-120px)] border rounded-3xl overflow-hidden shadow-2xl">
      
      {/* 1. LEFT NAV (Icons only) */}
      <div className="w-20 bg-white border-r flex flex-col items-center py-6 gap-2">
         <TabBtn active={activeNavTab === 'blocks'} onClick={() => setActiveNavTab('blocks')} icon={Plus} label="Блоки" />
         <TabBtn active={activeNavTab === 'page'} onClick={() => setActiveNavTab('page')} icon={Layout} label="Страница" />
         <TabBtn active={activeNavTab === 'design'} onClick={() => setActiveNavTab('design')} icon={Palette} label="Дизайн" />
         <div className="mt-auto flex flex-col gap-4">
            <button onClick={() => window.open(`/l/${slug}`, "_blank")} className="p-3 text-gray-400 hover:text-blue-600 transition-colors" title="Открыть страницу">
               <ExternalLink size={20} />
            </button>
            <button onClick={() => onSave(blocks, isPublished, settings)} className="p-4 bg-blue-600 text-white rounded-2xl shadow-lg hover:bg-blue-700 transition-all mx-2 active:scale-95">
               <ImageIcon size={20} />
            </button>
         </div>
      </div>

      {/* 2. CONTEXT PANEL (Expanded options for active tab) */}
      <div className="w-80 bg-white border-r flex flex-col">
          <div className="p-6 border-b">
             <h2 className="text-xl font-black text-gray-900 uppercase tracking-tighter">
                {activeNavTab === 'blocks' && "Добавить Блок"}
                {activeNavTab === 'page' && "Настройки"}
                {activeNavTab === 'design' && "Стиль сайта"}
             </h2>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 thin-scrollbar">
             {activeNavTab === 'blocks' && (
                <div className="grid grid-cols-2 gap-3">
                   <AddBtn icon={LayoutTemplate} label="Hero" onClick={() => addBlock("hero")} />
                   <AddBtn icon={Type} label="Текст" onClick={() => addBlock("text")} />
                   <AddBtn icon={MessageSquare} label="Вопрос" onClick={() => addBlock("text_input")} />
                   <AddBtn icon={CheckSquare} label="Фичи" onClick={() => addBlock("features")} />
                   <AddBtn icon={AlignJustify} label="Форма" onClick={() => addBlock("form")} />
                   <AddBtn icon={Video} label="Видео" onClick={() => addBlock("video")} />
                   <AddBtn icon={Clock} label="Таймер" onClick={() => addBlock("timer")} />
                   <AddBtn icon={StarIcon} label="Отзывы" onClick={() => addBlock("reviews")} />
                   <AddBtn icon={CreditCard} label="Тарифы" onClick={() => addBlock("pricing")} />
                   <AddBtn icon={Minus} label="Линия" onClick={() => addBlock("divider")} />
                   <AddBtn icon={MousePointerClick} label="Кнопка" onClick={() => addBlock("button")} />
                </div>
             )}

             {activeNavTab === 'page' && (
                <div className="space-y-6">
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border">
                        <div>
                            <p className="text-sm font-bold">Публикация</p>
                            <p className="text-[10px] text-gray-400">Виден ли лендинг всем</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" checked={isPublished} onChange={e => setIsPublished(e.target.checked)} />
                            <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                        </label>
                    </div>

                    <div className="space-y-4">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Интеграция Bitrix24</label>
                        <Input label="Stage ID" value={settings?.bitrix?.targetStageId} onChange={v => setSettings({...settings, bitrix: {...settings.bitrix, targetStageId: v}})} placeholder="C14:NEW" />
                        <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 italic text-[11px] text-blue-700">
                           Автоматически создаем сделку и контакт при заполнении форм.
                        </div>
                    </div>
                </div>
             )}

             {activeNavTab === 'design' && (
                <div className="space-y-8">
                   <div className="space-y-4">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Цветовые палитры</label>
                      <div className="space-y-3">
                         {PALETTES.map(p => (
                            <button 
                              key={p.id} 
                              onClick={() => applyPalette(p)}
                              className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all hover:scale-[1.02]
                                ${settings?.palette?.id === p.id ? 'border-blue-500 bg-blue-50/50' : 'border-gray-100 hover:border-gray-200'}`}
                            >
                               <div className="w-10 h-10 rounded-xl shadow-inner border flex items-center justify-center" style={{ backgroundColor: p.preview }}>
                                  <div className="w-4 h-4 rounded-full bg-white opacity-40" />
                               </div>
                               <div className="text-left">
                                  <div className="text-sm font-bold text-gray-900">{p.name}</div>
                                  <div className="text-[10px] text-gray-400">Global Theming</div>
                               </div>
                            </button>
                         ))}
                      </div>
                   </div>
                </div>
             )}
          </div>
      </div>

      {/* 3. CENTER: CANVAS */}
      <div className="flex-1 overflow-y-auto bg-gray-100 p-12 thin-scrollbar">
         <div className="max-w-4xl mx-auto space-y-4 pb-40">
            {blocks.map((block, index) => (
                <div 
                   key={block.id} 
                   onClick={() => setActiveBlockId(block.id)}
                   className={`group relative bg-white rounded-3xl shadow-sm border-2 transition-all cursor-pointer overflow-hidden
                     ${activeBlockId === block.id ? 'border-blue-500 ring-8 ring-blue-500/5' : 'border-transparent hover:border-blue-200'}`}
                >
                   {/* Preview Rendering */}
                   <div className="pointer-events-none select-none origin-top transition-transform duration-500">
                      {block.type === 'hero' && <HeroBlock content={block.content} design={block.design} />}
                      {block.type === 'features' && <FeaturesBlock content={block.content} design={block.design} />}
                      {block.type === 'button' && <ButtonBlock content={block.content} design={block.design} />}
                      {block.type === 'timer' && <TimerBlock content={block.content} design={block.design} />}
                      {block.type === 'reviews' && <ReviewsBlock content={block.content} design={block.design} />}
                      {block.type === 'pricing' && <PricingBlock content={block.content} design={block.design} />}
                      {block.type === 'divider' && <DividerBlock content={block.content} design={block.design} />}
                      {block.type === 'text' && (
                        <div className={`${block.design.bg} ${block.design.textColor} ${block.design.padding} text-${block.design.textAlign} prose max-w-none px-8`}>
                           <div dangerouslySetInnerHTML={{ __html: block.content.html }} />
                           {block.content.hasInput && (
                              <div className="mt-8 p-6 bg-gray-50 rounded-3xl border-2 border-dashed text-gray-400 italic text-sm">
                                 Поле: {block.content.inputLabel}
                              </div>
                           )}
                        </div>
                      )}
                      {block.type === 'video' && (
                        <div className={`${block.design.bg} ${block.design.padding} flex items-center justify-center`}>
                           <div className="aspect-video w-full max-w-2xl bg-black rounded-3xl shadow-2xl flex items-center justify-center text-white/20">
                              <Video size={64} />
                           </div>
                        </div>
                      )}
                      {block.type === 'form' && (
                         <div className={`${block.design.bg} ${block.design.padding} flex items-center justify-center`}>
                            <div className="bg-white border-2 border-dashed border-gray-200 w-full max-w-md p-10 rounded-3xl text-center">
                               <AlignJustify size={32} className="mx-auto mb-4 text-gray-300" />
                               <div className="text-sm font-bold text-gray-400 uppercase tracking-widest">Форма заявки</div>
                            </div>
                         </div>
                      )}
                   </div>

                   {/* Controls Overlay */}
                   <div className={`absolute top-4 right-4 flex flex-col gap-2 transition-all duration-300 transform
                      ${activeBlockId === block.id ? 'translate-x-0 opacity-100' : 'translate-x-10 opacity-0 group-hover:translate-x-0 group-hover:opacity-100'}`}>
                      <button onClick={(e) => { e.stopPropagation(); setBlocks([...blocks, { ...block, id: uuidv4(), orderIndex: blocks.length }]); }} className="w-10 h-10 bg-white border rounded-xl shadow-lg flex items-center justify-center text-gray-400 hover:text-blue-600 hover:scale-110 transition-all"><Copy size={16}/></button>
                      <button onClick={(e) => { e.stopPropagation(); if(index > 0){ const nb = [...blocks]; [nb[index], nb[index-1]] = [nb[index-1], nb[index]]; setBlocks(nb); } }} className="w-10 h-10 bg-white border rounded-xl shadow-lg flex items-center justify-center text-gray-400 hover:text-blue-600 hover:scale-110 transition-all"><ArrowUp size={16}/></button>
                      <button onClick={(e) => { e.stopPropagation(); if(index < blocks.length-1){ const nb = [...blocks]; [nb[index], nb[index+1]] = [nb[index+1], nb[index]]; setBlocks(nb); } }} className="w-10 h-10 bg-white border rounded-xl shadow-lg flex items-center justify-center text-gray-400 hover:text-blue-600 hover:scale-110 transition-all"><ArrowDown size={16}/></button>
                      <button onClick={(e) => { e.stopPropagation(); if(confirm("Del?")) setBlocks(blocks.filter(b => b.id !== block.id)); }} className="w-10 h-10 bg-red-50 border border-red-100 rounded-xl shadow-lg flex items-center justify-center text-red-400 hover:text-red-600 hover:scale-110 transition-all"><Trash size={16}/></button>
                   </div>
                </div>
            ))}
            
            {blocks.length === 0 && (
                <div className="h-96 border-4 border-dashed rounded-3xl flex flex-col items-center justify-center text-gray-300 gap-4">
                   <div className="w-20 h-20 rounded-full bg-gray-50 flex items-center justify-center">
                      <LayoutTemplate size={40} />
                   </div>
                   <p className="font-bold text-lg">Ваш лендинг пуст. Добавьте первый блок из меню слева.</p>
                </div>
            )}
         </div>
      </div>

      {/* 4. RIGHT: INSPECTOR */}
      <div className="w-96 bg-white border-l flex flex-col">
         {activeBlock ? (
             <>
                <div className="flex border-b p-2 gap-2 bg-gray-50/50">
                   <button onClick={() => setActiveInspectorTab('content')} className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${activeInspectorTab === 'content' ? 'bg-white shadow text-blue-600' : 'text-gray-400 hover:bg-gray-100'}`}>Контент</button>
                   <button onClick={() => setActiveInspectorTab('style')} className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${activeInspectorTab === 'style' ? 'bg-white shadow text-blue-600' : 'text-gray-400 hover:bg-gray-100'}`}>Дизайн</button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8 thin-scrollbar">
                   {activeInspectorTab === 'content' ? (
                      <div className="space-y-6">
                         <div className="pb-4 border-b flex justify-between items-center">
                            <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">{activeBlock.type} ID</span>
                            <span className="text-[10px] font-mono text-gray-300">{activeBlock.id.split('-')[0]}</span>
                         </div>

                         {activeBlock.type === 'hero' && (
                            <>
                               <Input label="Заголовок" value={activeBlock.content.title} onChange={v => updateContent(activeBlock.id, { title: v })} />
                               <TextArea label="Подзаголовок" value={activeBlock.content.subtitle} onChange={v => updateContent(activeBlock.id, { subtitle: v })} />
                               <div className="grid grid-cols-2 gap-4">
                                  <Input label="Кнопка" value={activeBlock.content.ctaText} onChange={v => updateContent(activeBlock.id, { ctaText: v })} />
                                  <Input label="Ссылка" value={activeBlock.content.ctaLink} onChange={v => updateContent(activeBlock.id, { ctaLink: v })} />
                               </div>
                               <Input label="Фон (Image URL)" value={activeBlock.content.backgroundImage} onChange={v => updateContent(activeBlock.id, { backgroundImage: v })} />
                               <div>
                                  <label className="text-[10px] font-bold text-gray-400 uppercase block mb-2">Overlay (Затемнение)</label>
                                  <input type="range" min="0" max="1" step="0.1" className="w-full" value={activeBlock.content.bgOverlay || 0} onChange={e => updateContent(activeBlock.id, { bgOverlay: parseFloat(e.target.value) })} />
                               </div>
                            </>
                         )}

                         {activeBlock.type === 'text' && (
                            <div className="space-y-6">
                               <RichTextEditor content={activeBlock.content.html} onChange={html => updateContent(activeBlock.id, { html })} />
                               
                               <div className="p-4 bg-gray-50 rounded-2xl border space-y-4">
                                  <label className="flex items-center gap-3 cursor-pointer">
                                     <input type="checkbox" checked={activeBlock.content.hasInput} onChange={e => updateContent(activeBlock.id, { hasInput: e.target.checked })} />
                                     <span className="text-xs font-bold">Ожидать ответ студента</span>
                                  </label>
                                  {activeBlock.content.hasInput && (
                                     <>
                                        <Input label="Заголовок поля" value={activeBlock.content.inputLabel} onChange={v => updateContent(activeBlock.id, { inputLabel: v })} />
                                        <select className="w-full p-3 bg-white border rounded-xl text-sm" value={activeBlock.content.bitrixFieldId || ""} onChange={e => updateContent(activeBlock.id, { bitrixFieldId: e.target.value })}>
                                           <option value="">Поле Bitrix24 (Default)</option>
                                           {bitrixFields.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                                        </select>
                                     </>
                                  )}
                               </div>
                            </div>
                         )}

                         {activeBlock.type === 'timer' && (
                            <div className="space-y-6">
                               <Input label="Заголовок" value={activeBlock.content.title} onChange={v => updateContent(activeBlock.id, { title: v })} />
                               <Input type="datetime-local" label="Дата окончания" value={activeBlock.content.deadline?.slice(0, 16)} onChange={v => updateContent(activeBlock.id, { deadline: new Date(v).toISOString() })} />
                            </div>
                         )}

                         {activeBlock.type === 'features' && (
                            <div className="space-y-6">
                               <Input label="Общий заголовок" value={activeBlock.content.title} onChange={v => updateContent(activeBlock.id, { title: v })} />
                               {activeBlock.content.items.map((item: any, idx: number) => (
                                  <div key={idx} className="p-4 bg-gray-50 rounded-2xl border space-y-4 relative group">
                                     <button onClick={() => updateContent(activeBlock.id, { items: activeBlock.content.items.filter((_: any, i: number) => i !== idx) })} className="absolute top-2 right-2 text-red-300 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all"><X size={14}/></button>
                                     <Input label="Заголовок" value={item.title} onChange={v => { const ni = [...activeBlock.content.items]; ni[idx].title = v; updateContent(activeBlock.id, { items: ni }); }} />
                                     <TextArea label="Описание" value={item.desc} onChange={v => { const ni = [...activeBlock.content.items]; ni[idx].desc = v; updateContent(activeBlock.id, { items: ni }); }} />
                                     <Input label="Иконка (emoji или lucide)" value={item.icon} onChange={v => { const ni = [...activeBlock.content.items]; ni[idx].icon = v; updateContent(activeBlock.id, { items: ni }); }} />
                                  </div>
                               ))}
                               <button onClick={() => updateContent(activeBlock.id, { items: [...activeBlock.content.items, { title: "Новая фича", desc: "...", icon: "⚡" }] })} className="w-full py-4 border-2 border-dashed rounded-2xl text-blue-600 text-xs font-bold uppercase hover:bg-blue-50 transition-colors">+ Добавить преимущество</button>
                            </div>
                         )}

                         {activeBlock.type === 'reviews' && (
                            <div className="space-y-6">
                               <Input label="Заголовок секции" value={activeBlock.content.title} onChange={v => updateContent(activeBlock.id, { title: v })} />
                               {activeBlock.content.items.map((item: any, idx: number) => (
                                  <div key={idx} className="p-4 bg-gray-50 rounded-2xl border space-y-4">
                                     <div className="flex gap-2">
                                        <Input label="Имя" value={item.name} onChange={v => { const ni = [...activeBlock.content.items]; ni[idx].name = v; updateContent(activeBlock.id, { items: ni }); }} />
                                        <Input label="Роль" value={item.role} onChange={v => { const ni = [...activeBlock.content.items]; ni[idx].role = v; updateContent(activeBlock.id, { items: ni }); }} />
                                     </div>
                                     <TextArea label="Отзыв" value={item.text} onChange={v => { const ni = [...activeBlock.content.items]; ni[idx].text = v; updateContent(activeBlock.id, { items: ni }); }} />
                                  </div>
                               ))}
                               <button onClick={() => updateContent(activeBlock.id, { items: [...activeBlock.content.items, { name: "Иван Иванов", role: "Студент", text: "..." }] })} className="w-full py-4 border-2 border-dashed rounded-2xl text-blue-600 text-xs font-bold uppercase hover:bg-blue-50 transition-colors">+ Добавить отзыв</button>
                            </div>
                         )}

                         {activeBlock.type === 'pricing' && (
                            <div className="space-y-8">
                               {activeBlock.content.plans.map((plan: any, idx: number) => (
                                  <div key={idx} className={`p-4 rounded-2xl border-2 space-y-4 relative ${plan.highlighted ? 'border-blue-500 bg-blue-50/20' : 'bg-gray-50'}`}>
                                     <div className="flex justify-between items-center">
                                         <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={plan.highlighted} onChange={e => { const np = [...activeBlock.content.plans]; np[idx].highlighted = e.target.checked; updateContent(activeBlock.id, { plans: np }); }} />
                                            <span className="text-[10px] font-black uppercase text-blue-700">Акцент</span>
                                         </label>
                                         <button onClick={() => { const np = activeBlock.content.plans.filter((_:any, i:number) => i !== idx); updateContent(activeBlock.id, { plans: np }); }} className="text-red-300 hover:text-red-500"><Trash size={14}/></button>
                                     </div>
                                     <Input label="Название" value={plan.name} onChange={v => { const np = [...activeBlock.content.plans]; np[idx].name = v; updateContent(activeBlock.id, { plans: np }); }} />
                                     <div className="flex gap-2">
                                        <Input label="Цена" value={plan.price} onChange={v => { const np = [...activeBlock.content.plans]; np[idx].price = v; updateContent(activeBlock.id, { plans: np }); }} />
                                        <Input label="Период" value={plan.period} onChange={v => { const np = [...activeBlock.content.plans]; np[idx].period = v; updateContent(activeBlock.id, { plans: np }); }} />
                                     </div>
                                     <TextArea label="Фичи (через запятую)" value={plan.features?.join(', ')} onChange={v => { const np = [...activeBlock.content.plans]; np[idx].features = v.split(',').map(s => s.trim()); updateContent(activeBlock.id, { plans: np }); }} />
                                  </div>
                               ))}
                               <button onClick={() => updateContent(activeBlock.id, { plans: [...activeBlock.content.plans, { name: "Новый тариф", price: "0", period: "месяц", features: [] }] })} className="w-full py-4 border-2 border-dashed rounded-2xl text-blue-600 text-xs font-bold uppercase hover:bg-blue-50 transition-colors">+ Добавить тариф</button>
                            </div>
                         )}

                         {activeBlock.type === 'divider' && (
                            <div className="space-y-6">
                               <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Стиль линии</label>
                               <div className="flex gap-2">
                                  {['line', 'empty'].map(s => (
                                     <button key={s} onClick={() => updateContent(activeBlock.id, { style: s })} className={`flex-1 py-3 rounded-xl border-2 text-xs font-bold uppercase transition-all ${activeBlock.content.style === s ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:bg-gray-50'}`}>{s}</button>
                                  ))}
                               </div>
                            </div>
                         )}
                         
                         {activeBlock.type === 'form' && (
                            <div className="space-y-6">
                                <TextArea label="Текст кнопки" value={activeBlock.content.buttonText} onChange={v => updateContent(activeBlock.id, { buttonText: v })} />
                                <div className="space-y-4">
                                   <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Привязка к уроку</label>
                                   <select className="w-full p-4 bg-gray-50 border rounded-2xl text-sm" value={activeBlock.lessonId || ""} onChange={e => updateBlock(activeBlock.id, { lessonId: e.target.value || null })}>
                                      <option value="">Без привязки</option>
                                      {lessons.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
                                   </select>
                                </div>
                            </div>
                         )}

                         {activeBlock.type === 'button' && (
                            <>
                               <Input label="Текст кнопки" value={activeBlock.content.text} onChange={v => updateContent(activeBlock.id, { text: v })} />
                               <Input label="Ссылка" value={activeBlock.content.link} onChange={v => updateContent(activeBlock.id, { link: v })} />
                            </>
                         )}

                         {activeBlock.type === 'video' && (
                            <Input label="Video ID" value={activeBlock.content.videoId} onChange={v => updateContent(activeBlock.id, { videoId: v })} placeholder="Cloudflare Stream ID" />
                         )}
                      </div>
                   ) : (
                      <div className="space-y-8">
                         <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-4">Разметка секции</label>
                            <div className="flex gap-2">
                               {['py-0', 'py-10', 'py-20', 'py-40'].map(p => (
                                  <button key={p} onClick={() => updateDesign(activeBlock.id, { padding: p })} className={`flex-1 py-3 border-2 rounded-xl text-[10px] font-black uppercase transition-all ${activeBlock.design.padding === p ? 'border-blue-500 bg-blue-50' : 'border-gray-50 hover:bg-white'}`}>{p.replace('py-', '')}</button>
                               ))}
                            </div>
                         </div>

                         <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-4">Выравнивание</label>
                            <div className="flex gap-2">
                               {['left', 'center', 'right'].map(a => (
                                  <button key={a} onClick={() => updateDesign(activeBlock.id, { textAlign: a })} className={`flex-1 py-3 border-2 rounded-xl text-[10px] font-black uppercase transition-all ${activeBlock.design.textAlign === a ? 'border-blue-500 bg-blue-50' : 'border-gray-50 hover:bg-white'}`}>{a}</button>
                               ))}
                            </div>
                         </div>

                         <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-4">Цвет секции</label>
                            <div className="grid grid-cols-5 gap-2">
                               {BG_OPTIONS.map(opt => (
                                  <button key={opt.value} onClick={() => updateDesign(activeBlock.id, { bg: opt.value, textColor: opt.value.includes('white') || opt.value.includes('50') ? 'text-gray-900' : 'text-white' })} className={`w-10 h-10 rounded-full border-2 transition-all ${opt.class} ${activeBlock.design.bg === opt.value ? 'ring-4 ring-blue-500/30 border-blue-500' : 'border-transparent hover:scale-110'}`} />
                               ))}
                            </div>
                         </div>
                         
                         <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Акцентный цвет</label>
                            <div className="flex gap-4 items-center">
                               <input type="color" className="w-12 h-12 rounded-xl p-1 bg-white border cursor-pointer" value={activeBlock.design.accentColor || "#3B82F6"} onChange={e => updateDesign(activeBlock.id, { accentColor: e.target.value })} />
                               <span className="text-xs font-mono text-gray-400 uppercase">{activeBlock.design.accentColor}</span>
                            </div>
                         </div>
                      </div>
                   )}
                </div>
                
                <div className="p-6 border-t bg-gray-50/30">
                   <button onClick={() => setActiveBlockId(null)} className="w-full py-4 text-xs font-black uppercase tracking-widest text-gray-400 hover:text-gray-600 transition-colors">Снять выделение</button>
                </div>
             </>
         ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-gray-400 gap-4">
               <div className="w-20 h-20 rounded-full bg-gray-50 flex items-center justify-center opacity-40">
                  <MousePointerClick size={32} />
               </div>
               <p className="text-sm font-medium leading-relaxed">Выберите блок на холсте, чтобы изменить его контент или стиль.</p>
            </div>
         )}
      </div>

      <style jsx global>{`
         .zoom-[0.8] { zoom: 0.8; }
      `}</style>
    </div>
  );
}
