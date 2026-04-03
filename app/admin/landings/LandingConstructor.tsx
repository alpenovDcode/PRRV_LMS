"use client";

import React, { useState, useEffect, ElementType, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
import { CloudflarePlayer } from "@/components/learn/cloudflare-player";

// --- SUBCOMPONENTS ---

interface AddBtnProps {
  icon: ElementType;
  label: string;
  onClick: () => void;
}

function AddBtn({ icon: Icon, label, onClick }: AddBtnProps) {
  return (
    <button onClick={onClick} className="flex flex-col items-center justify-center p-3.5 bg-white border border-gray-100 rounded-[1.5rem] shadow-sm hover:shadow-premium hover:border-blue-200 transition-all gap-2 group relative overflow-hidden">
      <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center group-hover:scale-110 group-hover:bg-blue-600 group-hover:text-white transition-all duration-300 shadow-inner">
         <Icon size={20} />
      </div>
      <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest group-hover:text-blue-600 transition-colors">{label}</span>
      <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  )
}

function TabBtn({ active, onClick, icon: Icon, label }: { active: boolean, onClick: () => void, icon: ElementType, label: string }) {
   return (
      <button 
        onClick={onClick}
        className={`flex flex-col items-center justify-center gap-1.5 w-full py-6 transition-all relative group
          ${active ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
      >
         <div className={`p-1.5 rounded-lg transition-all ${active ? 'bg-blue-50 shadow-inner' : 'group-hover:bg-gray-50'}`}>
            <Icon size={20} strokeWidth={active ? 2.5 : 2} />
         </div>
         <span className="text-[8px] font-black uppercase tracking-tighter">{label}</span>
         {active && (
           <motion.div 
             layoutId="tab-active"
             className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-12 bg-blue-600 rounded-l-full shadow-[0_0_15px_rgba(37,99,235,0.5)]" 
           />
         )}
      </button>
   )
}

function Input({ label, value, onChange, placeholder, type = "text" }: { label: string, value: string | number | undefined, onChange: (value: string) => void, placeholder?: string, type?: string }) {
   return (
      <div className="space-y-2">
         <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">{label}</label>
         <input 
            type={type}
            className="w-full p-4 border border-gray-100 rounded-2xl text-sm bg-gray-50/50 text-gray-900 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 focus:bg-white outline-none transition-all placeholder:text-gray-300 shadow-sm font-medium"
            value={value || ""}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
         />
      </div>
   )
}

function TextArea({ label, value, onChange, placeholder, rows = 3 }: { label: string, value: string | undefined, onChange: (value: string) => void, placeholder?: string, rows?: number }) {
   return (
      <div className="space-y-2">
         <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">{label}</label>
         <textarea 
            rows={rows}
            className="w-full p-4 border border-gray-100 rounded-2xl text-sm bg-gray-50/50 text-gray-900 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 focus:bg-white outline-none transition-all placeholder:text-gray-300 shadow-sm font-medium resize-none"
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
  width?: "full" | "1/2";
  column?: "left" | "right";
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
    ...b,
    id: b.id || uuidv4(),
    width: b.width || "full",
    column: b.column || "left",
    design: b.design || { ...DEFAULT_DESIGN },
    settings: b.settings || { utm: "", openAt: null }
  }));

  const [blocks, setBlocks] = useState<Block[]>(normalizedBlocks);
  const [isPublished, setIsPublished] = useState(initialIsPublished);
  const [settings, setSettings] = useState(initialSettings || { palette: PALETTES[0], layoutMode: 'cards', pageBg: 'bg-gray-50' });
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [activeNavTab, setActiveNavTab] = useState<"blocks" | "page" | "design">("blocks");
  const [activeInspectorTab, setActiveInspectorTab] = useState<"content" | "style">("content");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeBlockId) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        updateContent(activeBlockId, { backgroundImage: data.data.url });
      } else {
        alert(data.error?.message || "Ошибка при загрузке");
      }
    } catch (error) {
      console.error("Upload error:", error);
      alert("Произошла ошибка при загрузке");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };
  
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
      orderIndex: blocks.length,
      width: "full",
      column: "left"
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
    <div className="flex bg-[#F8FAFC] h-screen overflow-hidden w-full fixed inset-0 z-[100]">
      {/* FULL SCREEN STUDIO MODE */}
      
      {/* 1. LEFT NAV (Icons only) */}
      <div className="w-20 bg-white border-r border-gray-50 flex flex-col items-center py-6 gap-3 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
         <div className="mb-6">
            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-blue-500/30 shadow-lg">
               <LayoutTemplate size={24} strokeWidth={2.5} />
            </div>
         </div>
         <TabBtn active={activeNavTab === 'blocks'} onClick={() => setActiveNavTab('blocks')} icon={Plus} label="Блоки" />
         <TabBtn active={activeNavTab === 'page'} onClick={() => setActiveNavTab('page')} icon={Layout} label="Страница" />
         <TabBtn active={activeNavTab === 'design'} onClick={() => setActiveNavTab('design')} icon={Palette} label="Дизайн" />
         
         <div className="mt-auto flex flex-col gap-6 items-center w-full px-4">
            <button 
              onClick={() => window.open(`/l/${slug}`, "_blank")} 
              className="w-12 h-12 flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-2xl transition-all" 
              title="Предпросмотр"
            >
               <ExternalLink size={24} />
            </button>
            <button 
              onClick={() => onSave(blocks, isPublished, settings)} 
              className="w-14 h-14 bg-blue-600 text-white rounded-[1.5rem] shadow-xl shadow-blue-500/40 hover:bg-blue-700 hover:scale-110 active:scale-95 transition-all flex items-center justify-center"
              title="Сохранить изменения"
            >
               <RefreshCw size={24} strokeWidth={2.5} />
            </button>
         </div>
      </div>

      {/* 2. CONTEXT PANEL (Expanded options for active tab) */}
      <div className="w-72 bg-white border-r border-gray-50 flex flex-col shadow-[2px_0_12px_rgba(0,0,0,0.01)] transition-all z-20">
          <div className="p-6 border-b border-gray-50">
             <div className="text-[9px] font-black text-blue-600 uppercase tracking-[0.2em] mb-1.5">Навигатор</div>
             <h2 className="text-xl font-black text-gray-900 tracking-tight">
                {activeNavTab === 'blocks' && "Магазин блоков"}
                {activeNavTab === 'page' && "Параметры"}
                {activeNavTab === 'design' && "Стиль сайта"}
             </h2>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 thin-scrollbar bg-gray-50/30">
             <AnimatePresence mode="wait">
                <motion.div
                  key={activeNavTab}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.2 }}
                >
                  {activeNavTab === 'blocks' && (
                      <div className="grid grid-cols-2 gap-4">
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
                          <div className="p-6 bg-white rounded-[2rem] border border-gray-100 shadow-sm space-y-4">
                              <div className="flex items-center justify-between">
                                  <div>
                                      <p className="text-sm font-black text-gray-900 uppercase tracking-tight">Статус страницы</p>
                                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Опубликовано в сети</p>
                                  </div>
                                  <label className="relative inline-flex items-center cursor-pointer scale-110">
                                      <input type="checkbox" className="sr-only peer" checked={isPublished} onChange={e => setIsPublished(e.target.checked)} />
                                      <div className="w-12 h-6 bg-gray-100 rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-6 shadow-inner"></div>
                                  </label>
                              </div>
                          </div>

                          <div className="p-6 bg-white rounded-[2rem] border border-gray-100 shadow-sm space-y-6">
                              <label className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] block">Интеграция Bitrix24</label>
                              <Input label="Target Stage ID" value={settings?.bitrix?.targetStageId} onChange={v => setSettings({...settings, bitrix: {...settings.bitrix, targetStageId: v}})} placeholder="C14:NEW" />
                              <div className="p-5 bg-blue-50/50 rounded-2xl border border-blue-100 italic text-[11px] text-blue-700 leading-relaxed font-medium">
                                 Сделки и контакты будут создаваться автоматически при заполнении форм.
                              </div>
                          </div>

                          <div className="p-6 bg-white rounded-[2rem] border border-gray-100 shadow-sm space-y-4">
                              <div className="flex items-center justify-between">
                                  <div>
                                      <p className="text-sm font-black text-gray-900 uppercase tracking-tight">HTML Шаблон</p>
                                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Готовый дизайн страницы</p>
                                  </div>
                                  <label className="relative inline-flex items-center cursor-pointer scale-110">
                                      <input type="checkbox" className="sr-only peer" checked={!!settings?.htmlTemplate?.enabled} onChange={e => setSettings({...settings, htmlTemplate: {...(settings.htmlTemplate || {}), enabled: e.target.checked}})} />
                                      <div className="w-12 h-6 bg-gray-100 rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-6 shadow-inner"></div>
                                  </label>
                              </div>
                              {settings?.htmlTemplate?.enabled && (
                                  <div className="space-y-4 pt-2 border-t border-gray-100">
                                      <div className="p-4 bg-orange-50 rounded-2xl border border-orange-100 text-[11px] text-orange-700 font-medium italic">
                                          Шаблон: Антикризисный план 2026.<br/>Блоки конструктора скрыты — страница отображается как HTML.
                                      </div>
                                      <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 space-y-2">
                                          <p className="text-[10px] font-black text-blue-600 uppercase tracking-wider">Прямой Редирект</p>
                                          <Input 
                                              label="URL для переадресации" 
                                              value={settings?.htmlTemplate?.redirectUrl || ''} 
                                              onChange={v => setSettings({...settings, htmlTemplate: {...(settings.htmlTemplate || {}), redirectUrl: v}})}
                                              placeholder="https://..."
                                          />
                                          <p className="text-[9px] text-blue-400 font-medium italic">При заходе на лендинг пользователь будет мгновенно перенаправлен по этой ссылке.</p>
                                      </div>
                                      {([
                                          { key: 'heroCta', label: 'Кнопка Hero' },
                                          { key: 'sprintCta1', label: 'Кнопка Спринт (1)' },
                                          { key: 'sprintCta2', label: 'Кнопка Спринт (2)' },
                                          { key: 'finalCta', label: 'Кнопка Финальная' },
                                      ] as const).map(btn => (
                                          <div key={btn.key} className="space-y-2 p-4 bg-gray-50 rounded-2xl">
                                              <p className="text-[10px] font-black text-gray-500 uppercase tracking-wider">{btn.label}</p>
                                              <Input
                                                  label="Текст"
                                                  value={settings?.htmlTemplate?.buttons?.[btn.key]?.text || ''}
                                                  onChange={v => setSettings({
                                                      ...settings,
                                                      htmlTemplate: {
                                                          ...settings.htmlTemplate,
                                                          buttons: {
                                                              ...(settings.htmlTemplate?.buttons || {}),
                                                              [btn.key]: { ...(settings.htmlTemplate?.buttons?.[btn.key] || {}), text: v }
                                                          }
                                                      }
                                                  })}
                                              />
                                              <Input
                                                  label="Ссылка (URL)"
                                                  value={settings?.htmlTemplate?.buttons?.[btn.key]?.href || ''}
                                                  onChange={v => setSettings({
                                                      ...settings,
                                                      htmlTemplate: {
                                                          ...settings.htmlTemplate,
                                                          buttons: {
                                                              ...(settings.htmlTemplate?.buttons || {}),
                                                              [btn.key]: { ...(settings.htmlTemplate?.buttons?.[btn.key] || {}), href: v }
                                                          }
                                                      }
                                                  })}
                                                  placeholder="https://..."
                                              />
                                          </div>
                                      ))}
                                  </div>
                              )}
                          </div>
                      </div>
                  )}

                  {activeNavTab === 'design' && (
                      <div className="space-y-8">
                        <div className="space-y-6">
                            <label className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] block">Глобальные темы</label>
                            <div className="space-y-4">
                              {PALETTES.map(p => (
                                  <button 
                                    key={p.id} 
                                    onClick={() => applyPalette(p)}
                                    className={`w-full flex items-center gap-5 p-5 rounded-[2rem] border-2 transition-all group relative overflow-hidden
                                      ${settings?.palette?.id === p.id ? 'border-blue-600 bg-white shadow-premium' : 'border-transparent bg-white/50 hover:bg-white hover:border-gray-100 shadow-sm'}`}
                                  >
                                    <div className="w-14 h-14 rounded-2xl shadow-inner border border-gray-50 flex items-center justify-center transform transition-transform group-hover:scale-110" style={{ backgroundColor: p.preview }}>
                                        <div className="w-5 h-5 rounded-full bg-white/30 backdrop-blur-sm" />
                                    </div>
                                    <div className="text-left">
                                        <div className="text-base font-black text-gray-900 tracking-tight">{p.name}</div>
                                        <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{p.id === 'onyx' ? 'Dark Mode' : 'Light Theme'}</div>
                                    </div>
                                    {settings?.palette?.id === p.id && (
                                      <div className="absolute right-6 top-1/2 -translate-y-1/2 text-blue-600">
                                          <ChevronRight size={20} strokeWidth={3} />
                                      </div>
                                    )}
                                  </button>
                              ))}
                            </div>
                        </div>

                        <div className="space-y-6 pt-6 border-t border-gray-100">
                             <label className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] block">Тип разметки</label>
                             <div className="flex gap-4 p-2 bg-gray-50 rounded-[1.5rem] border border-gray-100">
                                <button 
                                  onClick={() => setSettings({...settings, layoutMode: 'full'})}
                                  className={`flex-1 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all
                                    ${settings.layoutMode === 'full' ? 'bg-white shadow-premium text-blue-600 scale-105' : 'text-gray-400 hover:bg-white/50'}`}
                                >
                                  Стандарт
                                </button>
                                <button 
                                  onClick={() => setSettings({...settings, layoutMode: 'cards'})}
                                  className={`flex-1 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all
                                    ${settings.layoutMode === 'cards' ? 'bg-white shadow-premium text-blue-600 scale-105' : 'text-gray-400 hover:bg-white/50'}`}
                                >
                                  Блочный
                                </button>
                             </div>
                        </div>

                        <div className="space-y-6 pt-6 border-t border-gray-100">
                             <label className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] block">Фон страницы</label>
                             <div className="grid grid-cols-3 gap-4">
                                {BG_OPTIONS.map(opt => (
                                   <button 
                                     key={opt.value} 
                                     onClick={() => setSettings({...settings, pageBg: opt.value})} 
                                     className={`h-16 rounded-[1.5rem] border-2 transition-all relative group overflow-hidden ${opt.class}
                                       ${settings.pageBg === opt.value ? 'border-blue-600 ring-4 ring-blue-500/10' : 'border-transparent hover:scale-105 shadow-sm'}`}
                                   >
                                      <div className={`absolute bottom-2 left-2 text-[8px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity ${opt.value.includes('900') || opt.value.includes('950') ? 'text-white/50' : 'text-gray-400'}`}>
                                         {opt.label}
                                      </div>
                                   </button>
                                ))}
                             </div>
                        </div>
                      </div>
                  )}
                </motion.div>
             </AnimatePresence>
          </div>
      </div>

      {/* 3. CENTER: CANVAS */}
      <div className="flex-1 overflow-y-auto bg-[#F1F5F9] p-8 thin-scrollbar relative shadow-inner">
         <div className="max-w-5xl mx-auto min-h-full bg-white shadow-premium rounded-[3.5rem] overflow-hidden border border-gray-200/50 mb-20 relative ring-1 ring-black/5">
            <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 z-20" />
            <div className={settings.pageBg + " min-h-screen transition-colors duration-500"}>
                <div className="p-8">
                  {(() => {
                    const groups: any[] = [];
                    let currentGroup: any = null;

                    blocks.forEach(block => {
                      if ((block.width || 'full') === 'full') {
                        groups.push({ type: 'full', block });
                        currentGroup = null;
                      } else {
                        if (!currentGroup) {
                          currentGroup = { type: 'grid', left: [], right: [] };
                          groups.push(currentGroup);
                        }
                        if (block.column === 'right') {
                          currentGroup.right.push(block);
                        } else {
                          currentGroup.left.push(block);
                        }
                      }
                    });

                    return groups.map((group, gIdx) => {
                      if (group.type === 'full') {
                        const block = group.block;
                        const index = blocks.findIndex(b => b.id === block.id);
                        return (
                          <motion.div 
                            layout
                            key={block.id} 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            onClick={() => setActiveBlockId(block.id)}
                            className={`group relative bg-white rounded-[4.5rem] shadow-sm border-2 transition-all cursor-pointer overflow-hidden w-full mb-6
                              ${activeBlockId === block.id ? 'border-blue-500 ring-[12px] ring-blue-500/5 shadow-premium' : 'border-transparent hover:border-blue-200 hover:shadow-md'}`}
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
                                  <div className={`${block.design.bg} ${block.design.textColor} ${block.design.padding} text-${block.design.textAlign} prose max-w-none px-12`}>
                                     <div dangerouslySetInnerHTML={{ __html: block.content.html }} />
                                     {block.content.hasInput && (
                                        <div className="mt-12 p-8 bg-gray-50/80 backdrop-blur-sm rounded-[2rem] border-2 border-dashed border-gray-200 text-gray-400 italic text-sm text-center">
                                           Поле: {block.content.inputLabel}
                                        </div>
                                     )}
                                  </div>
                                )}
                                {block.type === 'video' && (
                                  <div className={`${block.design.bg} ${block.design.padding} flex items-center justify-center p-12`}>
                                     <div className="aspect-video w-full max-w-2xl bg-black rounded-[2.5rem] shadow-2xl overflow-hidden ring-1 ring-white/10">
                                        <CloudflarePlayer videoId={block.content.videoId} />
                                     </div>
                                  </div>
                                )}
                                {block.type === 'form' && (
                                   <div className={`${block.design.bg} ${block.design.padding} flex items-center justify-center p-12`}>
                                      <div className="bg-white/50 backdrop-blur-md border-2 border-dashed border-gray-200 w-full max-w-md p-12 rounded-[2.5rem] text-center shadow-inner">
                                         <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 mx-auto mb-6">
                                            <AlignJustify size={32} />
                                         </div>
                                         <div className="text-sm font-black text-gray-900 uppercase tracking-[0.2em]">Форма регистрации</div>
                                         <div className="text-[10px] text-gray-400 font-bold uppercase mt-2">Bitrix24 Lead Generation</div>
                                      </div>
                                   </div>
                                )}
                             </div>

                             {/* Controls Overlay */}
                             <div className={`absolute top-6 right-6 flex flex-col gap-3 transition-all duration-300 transform
                                ${activeBlockId === block.id ? 'translate-x-0 opacity-100' : 'translate-x-12 opacity-0 group-hover:translate-x-0 group-hover:opacity-100'}`}>
                                <button onClick={(e) => { e.stopPropagation(); setBlocks([...blocks, { ...block, id: uuidv4(), orderIndex: blocks.length }]); }} className="w-11 h-11 bg-white border border-gray-100 rounded-2xl shadow-premium flex items-center justify-center text-gray-400 hover:text-blue-600 hover:scale-110 active:scale-90 transition-all"><Copy size={18}/></button>
                                <button onClick={(e) => { e.stopPropagation(); if(index > 0){ const nb = [...blocks]; [nb[index], nb[index-1]] = [nb[index-1], nb[index]]; setBlocks(nb); } }} className="w-11 h-11 bg-white border border-gray-100 rounded-2xl shadow-premium flex items-center justify-center text-gray-400 hover:text-blue-600 hover:scale-110 active:scale-90 transition-all"><ArrowUp size={18}/></button>
                                <button onClick={(e) => { e.stopPropagation(); if(index < blocks.length-1){ const nb = [...blocks]; [nb[index], nb[index+1]] = [nb[index+1], nb[index]]; setBlocks(nb); } }} className="w-11 h-11 bg-white border border-gray-100 rounded-2xl shadow-premium flex items-center justify-center text-gray-400 hover:text-blue-600 hover:scale-110 active:scale-90 transition-all"><ArrowDown size={18}/></button>
                                <button onClick={(e) => { e.stopPropagation(); if(confirm("Удалить блок?")) setBlocks(blocks.filter(b => b.id !== block.id)); }} className="w-11 h-11 bg-red-50 border border-red-100 rounded-2xl shadow-premium flex items-center justify-center text-red-400 hover:text-red-600 hover:scale-110 active:scale-90 transition-all"><Trash size={18}/></button>
                             </div>
                          </motion.div>
                        );
                      } else {
                        return (
                          <div key={gIdx} className="flex gap-6 w-full mb-6 items-start">
                            {/* LEFT COLUMN */}
                            <div className="flex-1 flex flex-col gap-6">
                              {group.left.map((block: any) => {
                                const index = blocks.findIndex(b => b.id === block.id);
                                return (
                                  <motion.div 
                                    layout
                                    key={block.id} 
                                    onClick={() => setActiveBlockId(block.id)}
                                    className={`group relative bg-white rounded-[3.5rem] shadow-sm border-2 transition-all cursor-pointer overflow-hidden w-full
                                      ${activeBlockId === block.id ? 'border-blue-500 ring-[8px] ring-blue-500/5 shadow-premium' : 'border-transparent hover:border-blue-200 hover:shadow-md'}`}
                                  >
                                    <div className="pointer-events-none select-none origin-top transition-transform duration-500 scale-[0.85] -m-[7.5%]">
                                      {block.type === 'text' && (
                                        <div className={`${block.design.bg} ${block.design.textColor} ${block.design.padding} text-${block.design.textAlign} prose max-w-none px-12`}>
                                           <div dangerouslySetInnerHTML={{ __html: block.content.html }} />
                                        </div>
                                      )}
                                      {block.type === 'video' && (
                                        <div className={`${block.design.bg} ${block.design.padding} flex items-center justify-center p-6`}>
                                          <div className="aspect-video w-full bg-black rounded-[2rem] shadow-2xl overflow-hidden">
                                            <div className="w-full h-full flex items-center justify-center text-white text-xs">Video Placeholder</div>
                                          </div>
                                        </div>
                                      )}
                                      {block.type === 'hero' && <HeroBlock content={block.content} design={block.design} />}
                                      {block.type === 'features' && <FeaturesBlock content={block.content} design={block.design} />}
                                      {block.type === 'button' && <ButtonBlock content={block.content} design={block.design} />}
                                      {block.type === 'timer' && <TimerBlock content={block.content} design={block.design} />}
                                      {block.type === 'reviews' && <ReviewsBlock content={block.content} design={block.design} />}
                                      {block.type === 'pricing' && <PricingBlock content={block.content} design={block.design} />}
                                      {block.type === 'divider' && <DividerBlock content={block.content} design={block.design} />}
                                    </div>
                                    {/* Controls overlay for 1/2 blocks */}
                                    <div className={`absolute top-4 right-4 flex flex-col gap-2 transition-all duration-300 transform
                                      ${activeBlockId === block.id ? 'translate-x-0 opacity-100' : 'translate-x-8 opacity-0 group-hover:translate-x-0 group-hover:opacity-100'}`}>
                                      <button onClick={(e) => { e.stopPropagation(); setBlocks([...blocks, { ...block, id: uuidv4() }]); }} className="w-8 h-8 bg-white border border-gray-100 rounded-xl shadow-premium flex items-center justify-center text-gray-400 hover:text-blue-600"><Copy size={14}/></button>
                                      <button onClick={(e) => { e.stopPropagation(); if(confirm("Удалить?")) setBlocks(blocks.filter(b => b.id !== block.id)); }} className="w-8 h-8 bg-red-50 border border-red-100 rounded-xl shadow-premium flex items-center justify-center text-red-400 hover:text-red-600"><Trash size={14}/></button>
                                    </div>
                                  </motion.div>
                                );
                              })}
                            </div>
                            
                            {/* RIGHT COLUMN */}
                            <div className="flex-1 flex flex-col gap-6">
                              {group.right.map((block: any) => {
                                const index = blocks.findIndex(b => b.id === block.id);
                                return (
                                  <motion.div 
                                    layout
                                    key={block.id} 
                                    onClick={() => setActiveBlockId(block.id)}
                                    className={`group relative bg-white rounded-[3.5rem] shadow-sm border-2 transition-all cursor-pointer overflow-hidden w-full
                                      ${activeBlockId === block.id ? 'border-blue-500 ring-[8px] ring-blue-500/5 shadow-premium' : 'border-transparent hover:border-blue-200 hover:shadow-md'}`}
                                  >
                                    <div className="pointer-events-none select-none origin-top transition-transform duration-500 scale-[0.85] -m-[7.5%]">
                                      {block.type === 'text' && (
                                        <div className={`${block.design.bg} ${block.design.textColor} ${block.design.padding} text-${block.design.textAlign} prose max-w-none px-12`}>
                                           <div dangerouslySetInnerHTML={{ __html: block.content.html }} />
                                        </div>
                                      )}
                                      {block.type === 'video' && (
                                        <div className={`${block.design.bg} ${block.design.padding} flex items-center justify-center p-6`}>
                                          <div className="aspect-video w-full bg-black rounded-[2rem] shadow-2xl overflow-hidden">
                                            <div className="w-full h-full flex items-center justify-center text-white text-xs">Video Placeholder</div>
                                          </div>
                                        </div>
                                      )}
                                      {block.type === 'hero' && <HeroBlock content={block.content} design={block.design} />}
                                      {block.type === 'features' && <FeaturesBlock content={block.content} design={block.design} />}
                                      {block.type === 'button' && <ButtonBlock content={block.content} design={block.design} />}
                                      {block.type === 'timer' && <TimerBlock content={block.content} design={block.design} />}
                                      {block.type === 'reviews' && <ReviewsBlock content={block.content} design={block.design} />}
                                      {block.type === 'pricing' && <PricingBlock content={block.content} design={block.design} />}
                                      {block.type === 'divider' && <DividerBlock content={block.content} design={block.design} />}
                                    </div>
                                    <div className={`absolute top-4 right-4 flex flex-col gap-2 transition-all duration-300 transform
                                      ${activeBlockId === block.id ? 'translate-x-0 opacity-100' : 'translate-x-8 opacity-0 group-hover:translate-x-0 group-hover:opacity-100'}`}>
                                      <button onClick={(e) => { e.stopPropagation(); setBlocks([...blocks, { ...block, id: uuidv4() }]); }} className="w-8 h-8 bg-white border border-gray-100 rounded-xl shadow-premium flex items-center justify-center text-gray-400 hover:text-blue-600"><Copy size={14}/></button>
                                      <button onClick={(e) => { e.stopPropagation(); if(confirm("Удалить?")) setBlocks(blocks.filter(b => b.id !== block.id)); }} className="w-8 h-8 bg-red-50 border border-red-100 rounded-xl shadow-premium flex items-center justify-center text-red-400 hover:text-red-600"><Trash size={14}/></button>
                                    </div>
                                  </motion.div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      }
                    });
                  })()}
               </div>
            </div>
         </div>
      </div>

      {/* 4. RIGHT: INSPECTOR */}
      <div className="w-80 bg-white border-l border-gray-50 flex flex-col shadow-[-4px_0_24px_rgba(0,0,0,0.02)] z-20">
         {activeBlock ? (
             <>
                <div className="p-4 flex gap-2 bg-gray-50/50 border-b border-gray-50">
                   <button 
                     onClick={() => setActiveInspectorTab('content')} 
                     className={`flex-1 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] transition-all relative
                       ${activeInspectorTab === 'content' ? 'bg-white shadow-premium text-blue-600 scale-105 z-10' : 'text-gray-400 hover:bg-gray-100'}`}
                   >
                     Контент
                   </button>
                   <button 
                     onClick={() => setActiveInspectorTab('style')} 
                     className={`flex-1 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] transition-all relative
                       ${activeInspectorTab === 'style' ? 'bg-white shadow-premium text-blue-600 scale-105 z-10' : 'text-gray-400 hover:bg-gray-100'}`}
                   >
                     Дизайн
                   </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6 thin-scrollbar">
                   <AnimatePresence mode="wait">
                   <motion.div
                     key={`${activeBlock.id}-${activeInspectorTab}`}
                     initial={{ opacity: 0, y: 10 }}
                     animate={{ opacity: 1, y: 0 }}
                     exit={{ opacity: 0, y: -10 }}
                     transition={{ duration: 0.2 }}
                   >
                   {activeInspectorTab === 'content' ? (
                      <div className="space-y-8">
                         <div className="pb-6 border-b border-gray-50 flex justify-between items-end">
                            <div>
                               <div className="text-[9px] font-black text-blue-600 uppercase tracking-[0.2em] mb-1">Свойства блока</div>
                               <div className="text-lg font-black text-gray-900 tracking-tight capitalize">{activeBlock.type}</div>
                            </div>
                            <span className="text-[10px] font-mono text-gray-300 bg-gray-50 px-3 py-1 rounded-full border border-gray-100">#{activeBlock.id.split('-')[0]}</span>
                         </div>

                         {activeBlock.type === 'hero' && (
                            <div className="space-y-6">
                               <Input label="Заголовок" value={activeBlock.content.title} onChange={v => updateContent(activeBlock.id, { title: v })} />
                               <TextArea label="Подзаголовок" value={activeBlock.content.subtitle} onChange={v => updateContent(activeBlock.id, { subtitle: v })} />
                               <div className="grid grid-cols-2 gap-4">
                                  <Input label="Текст кнопки" value={activeBlock.content.ctaText} onChange={v => updateContent(activeBlock.id, { ctaText: v })} />
                                  <Input label="Ссылка" value={activeBlock.content.ctaLink} onChange={v => updateContent(activeBlock.id, { ctaLink: v })} />
                               </div>
                                <div className="space-y-3">
                                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Фоновое изображение</label>
                                   <div className="flex gap-3">
                                      <div className="flex-1">
                                         <Input label="Ссылка на изображение" value={activeBlock.content.backgroundImage} onChange={v => updateContent(activeBlock.id, { backgroundImage: v })} placeholder="https://..." />
                                      </div>
                                      <div className="pt-6">
                                         <button 
                                           onClick={() => fileInputRef.current?.click()}
                                           disabled={isUploading}
                                           className={`h-[52px] px-6 rounded-2xl border-2 border-gray-100 font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap
                                             ${isUploading ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'bg-white hover:bg-blue-50/10 hover:border-blue-200 hover:text-blue-600'}`}
                                         >
                                           {isUploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                                           {isUploading ? '...' : 'Загрузить'}
                                         </button>
                                      </div>
                                   </div>
                                </div>
                               <div className="space-y-4">
                                  <div className="flex justify-between items-center">
                                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Overlay (Затемнение)</label>
                                      <span className="text-xs font-mono font-bold text-blue-600">{Math.round((activeBlock.content.bgOverlay || 0) * 100)}%</span>
                                  </div>
                                  <input type="range" min="0" max="1" step="0.1" className="w-full accent-blue-600" value={activeBlock.content.bgOverlay || 0} onChange={e => updateContent(activeBlock.id, { bgOverlay: parseFloat(e.target.value) })} />
                               </div>
                            </div>
                         )}

                         {activeBlock.type === 'text' && (
                            <div className="space-y-8">
                               <RichTextEditor content={activeBlock.content.html} onChange={html => updateContent(activeBlock.id, { html })} />
                               
                               <div className="p-8 bg-gray-50/50 rounded-[2.5rem] border border-gray-100 space-y-6">
                                  <label className="flex items-center justify-between cursor-pointer group">
                                     <div>
                                        <p className="text-sm font-black text-gray-900 uppercase tracking-tight">Режим ответа</p>
                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Ожидать ввод студента</p>
                                     </div>
                                     <div className="relative inline-flex items-center scale-110">
                                          <input type="checkbox" className="sr-only peer" checked={activeBlock.content.hasInput} onChange={e => updateContent(activeBlock.id, { hasInput: e.target.checked })} />
                                          <div className="w-12 h-6 bg-gray-200 rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-6 shadow-inner"></div>
                                     </div>
                                  </label>
                                  {activeBlock.content.hasInput && (
                                     <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-6 pt-6 border-t border-gray-100">
                                        <Input label="Заголовок поля" value={activeBlock.content.inputLabel} onChange={v => updateContent(activeBlock.id, { inputLabel: v })} />
                                        <div className="space-y-2">
                                           <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">Поле Bitrix24</label>
                                           <select 
                                              className="w-full p-4 border border-gray-100 rounded-2xl text-sm bg-white text-gray-900 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 outline-none transition-all shadow-sm font-medium" 
                                              value={activeBlock.content.bitrixFieldId || ""} 
                                              onChange={e => updateContent(activeBlock.id, { bitrixFieldId: e.target.value })}
                                           >
                                              <option value="">Автоматически (Default)</option>
                                              {bitrixFields.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                                           </select>
                                        </div>
                                     </motion.div>
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
                               <div className="space-y-4">
                                 {activeBlock.content.items.map((item: any, idx: number) => (
                                    <div key={idx} className="p-6 bg-white rounded-[2rem] border border-gray-100 shadow-sm space-y-4 relative group hover:border-blue-200 transition-all">
                                       <button onClick={() => updateContent(activeBlock.id, { items: activeBlock.content.items.filter((_: any, i: number) => i !== idx) })} className="absolute top-4 right-4 text-gray-300 hover:text-red-500 transition-all"><X size={16}/></button>
                                       <Input label="Заголовок" value={item.title} onChange={v => { const ni = [...activeBlock.content.items]; ni[idx].title = v; updateContent(activeBlock.id, { items: ni }); }} />
                                       <TextArea label="Описание" value={item.desc} onChange={v => { const ni = [...activeBlock.content.items]; ni[idx].desc = v; updateContent(activeBlock.id, { items: ni }); }} />
                                       <Input label="Иконка (Emoji/Lucide)" value={item.icon} onChange={v => { const ni = [...activeBlock.content.items]; ni[idx].icon = v; updateContent(activeBlock.id, { items: ni }); }} />
                                    </div>
                                 ))}
                               </div>
                               <button onClick={() => updateContent(activeBlock.id, { items: [...activeBlock.content.items, { title: "Преимущество", desc: "Описание...", icon: "⚡" }] })} className="w-full py-6 border-2 border-dashed border-blue-100 rounded-[2rem] text-blue-600 text-[10px] font-black uppercase tracking-widest hover:bg-blue-50 hover:border-blue-200 transition-all">+ Добавить карточку</button>
                            </div>
                         )}

                         {activeBlock.type === 'reviews' && (
                            <div className="space-y-6">
                               <Input label="Заголовок секции" value={activeBlock.content.title} onChange={v => updateContent(activeBlock.id, { title: v })} />
                               <div className="space-y-4">
                                 {activeBlock.content.items.map((item: any, idx: number) => (
                                    <div key={idx} className="p-6 bg-white rounded-[2rem] border border-gray-100 shadow-sm space-y-4 hover:border-blue-200 transition-all">
                                       <div className="grid grid-cols-2 gap-4">
                                          <Input label="Имя" value={item.name} onChange={v => { const ni = [...activeBlock.content.items]; ni[idx].name = v; updateContent(activeBlock.id, { items: ni }); }} />
                                          <Input label="Роль" value={item.role} onChange={v => { const ni = [...activeBlock.content.items]; ni[idx].role = v; updateContent(activeBlock.id, { items: ni }); }} />
                                       </div>
                                       <TextArea label="Отзыв" value={item.text} onChange={v => { const ni = [...activeBlock.content.items]; ni[idx].text = v; updateContent(activeBlock.id, { items: ni }); }} />
                                    </div>
                                 ))}
                               </div>
                               <button onClick={() => updateContent(activeBlock.id, { items: [...activeBlock.content.items, { name: "Иван Иванов", role: "Студент", text: "..." }] })} className="w-full py-6 border-2 border-dashed border-blue-100 rounded-[2rem] text-blue-600 text-[10px] font-black uppercase tracking-widest hover:bg-blue-50 hover:border-blue-200 transition-all">+ Добавить отзыв</button>
                            </div>
                         )}

                         {activeBlock.type === 'pricing' && (
                            <div className="space-y-8">
                               {activeBlock.content.plans.map((plan: any, idx: number) => (
                                  <div key={idx} className={`p-8 rounded-[2.5rem] border-2 space-y-6 relative transition-all shadow-sm ${plan.highlighted ? 'border-blue-500 bg-blue-50/20' : 'bg-white border-gray-100'}`}>
                                     <div className="flex justify-between items-center">
                                         <label className="flex items-center gap-3 cursor-pointer group">
                                            <div className="relative inline-flex items-center scale-90">
                                               <input type="checkbox" className="sr-only peer" checked={plan.highlighted} onChange={e => { const np = [...activeBlock.content.plans]; np[idx].highlighted = e.target.checked; updateContent(activeBlock.id, { plans: np }); }} />
                                               <div className="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5 shadow-inner"></div>
                                            </div>
                                            <span className="text-[10px] font-black uppercase tracking-widest text-blue-600">Акцент</span>
                                         </label>
                                         <button onClick={() => { const np = activeBlock.content.plans.filter((_:any, i:number) => i !== idx); updateContent(activeBlock.id, { plans: np }); }} className="text-gray-300 hover:text-red-500 transition-colors"><Trash size={16}/></button>
                                     </div>
                                     <Input label="Название тарифа" value={plan.name} onChange={v => { const np = [...activeBlock.content.plans]; np[idx].name = v; updateContent(activeBlock.id, { plans: np }); }} />
                                     <div className="grid grid-cols-2 gap-4">
                                        <Input label="Цена" value={plan.price} onChange={v => { const np = [...activeBlock.content.plans]; np[idx].price = v; updateContent(activeBlock.id, { plans: np }); }} />
                                        <Input label="Период" value={plan.period} onChange={v => { const np = [...activeBlock.content.plans]; np[idx].period = v; updateContent(activeBlock.id, { plans: np }); }} />
                                     </div>
                                     <TextArea label="Особенности (через запятую)" value={plan.features?.join(', ')} onChange={v => { const np = [...activeBlock.content.plans]; np[idx].features = v.split(',').map(s => s.trim()); updateContent(activeBlock.id, { plans: np }); }} />
                                  </div>
                               ))}
                               <button onClick={() => updateContent(activeBlock.id, { plans: [...activeBlock.content.plans, { name: "Новый тариф", price: "0", period: "месяц", features: [] }] })} className="w-full py-6 border-2 border-dashed border-blue-100 rounded-[2rem] text-blue-600 text-[10px] font-black uppercase tracking-widest hover:bg-blue-50 transition-all">+ Добавить тариф</button>
                            </div>
                         )}

                         {activeBlock.type === 'divider' && (
                            <div className="space-y-6">
                               <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">Стиль линии</label>
                               <div className="flex gap-4 p-2 bg-gray-50 rounded-[1.5rem] border border-gray-100">
                                  {['line', 'empty'].map(s => (
                                     <button 
                                       key={s} 
                                       onClick={() => updateContent(activeBlock.id, { style: s })} 
                                       className={`flex-1 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all
                                         ${activeBlock.content.style === s ? 'bg-white shadow-premium text-blue-600' : 'text-gray-400 hover:bg-gray-100'}`}
                                     >
                                       {s === 'line' ? 'Сплошная' : 'Отступ'}
                                     </button>
                                  ))}
                               </div>
                            </div>
                         )}
                         
                         {activeBlock.type === 'form' && (
                            <div className="space-y-8">
                                <TextArea label="Текст кнопки" value={activeBlock.content.buttonText} onChange={v => updateContent(activeBlock.id, { buttonText: v })} />
                                <div className="space-y-2">
                                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">Привязка к уроку LMS</label>
                                   <select 
                                      className="w-full p-4 border border-gray-100 rounded-2xl text-sm bg-white text-gray-900 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 outline-none transition-all shadow-sm font-medium" 
                                      value={activeBlock.lessonId || ""} 
                                      onChange={e => updateBlock(activeBlock.id, { lessonId: e.target.value || null })}
                                   >
                                      <option value="">Без привязки (Визитка)</option>
                                      {lessons.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
                                   </select>
                                   <p className="text-[10px] text-blue-600 font-bold uppercase px-1">После оплаты студент получит доступ к уроку.</p>
                                </div>
                            </div>
                         )}

                         {activeBlock.type === 'button' && (
                            <div className="space-y-6">
                               <Input label="Текст на кнопке" value={activeBlock.content.text} onChange={v => updateContent(activeBlock.id, { text: v })} />
                               <Input label="Ссылка (URL)" value={activeBlock.content.link} onChange={v => updateContent(activeBlock.id, { link: v })} />
                            </div>
                         )}

                         {activeBlock.type === 'video' && (
                            <Input label="Cloudflare Stream ID" value={activeBlock.content.videoId} onChange={v => updateContent(activeBlock.id, { videoId: v })} placeholder="Напр. f45f..." />
                         )}
                      </div>
                   ) : (
                      <div className="space-y-10">
                         <div className="space-y-6">
                            <label className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] block">Внутренние отступы</label>
                            <div className="grid grid-cols-2 gap-4">
                               {['py-0', 'py-12', 'py-24', 'py-40'].map(p => (
                                  <button 
                                    key={p} 
                                    onClick={() => updateDesign(activeBlock.id, { padding: p })} 
                                    className={`py-4 rounded-2xl border-2 text-[10px] font-black uppercase tracking-widest transition-all
                                      ${activeBlock.design.padding === p ? 'border-blue-600 bg-blue-50/50 text-blue-600 shadow-sm' : 'border-gray-50 hover:bg-white hover:border-gray-200 text-gray-400'}`}
                                  >
                                    {p === 'py-0' ? 'None' : p.replace('py-', '') + 'px'}
                                  </button>
                                ))}
                             </div>
                          </div>

                          <div className="space-y-6">
                              <label className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] block">Выравнивание контента</label>
                             <div className="flex gap-4 p-2 bg-gray-50/50 rounded-[1.5rem] border border-gray-100">
                                {['left', 'center', 'right'].map(a => (
                                   <button 
                                     key={a} 
                                     onClick={() => updateDesign(activeBlock.id, { textAlign: a })} 
                                     className={`flex-1 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all
                                       ${activeBlock.design.textAlign === a ? 'bg-white shadow-premium text-blue-600 scale-105' : 'text-gray-400 hover:bg-white/50'}`}
                                   >
                                     {a === 'left' ? 'Слева' : a === 'center' ? 'Центр' : 'Справа'}
                                   </button>
                                ))}
                             </div>
                          </div>

                          <div className="space-y-6 pt-6 border-t border-gray-50">
                             <label className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] block">Размер и Позиция</label>
                             <div className="space-y-4">
                               <div className="flex gap-4 p-2 bg-gray-50/50 rounded-[1.5rem] border border-gray-100">
                                  {(['full', '1/2'] as const).map(w => (
                                     <button 
                                       key={w} 
                                       onClick={() => updateBlock(activeBlock.id, { width: w })} 
                                       className={`flex-1 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all
                                         ${(activeBlock.width || 'full') === w ? 'bg-white shadow-premium text-blue-600 scale-105' : 'text-gray-400 hover:bg-white/50'}`}
                                     >
                                       {w === 'full' ? '100%' : '50%'}
                                     </button>
                                  ))}
                               </div>
                               
                               {(activeBlock.width || 'full') === '1/2' && (
                                 <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex gap-4 p-2 bg-blue-50/30 rounded-[1.5rem] border border-blue-100">
                                   {(['left', 'right'] as const).map(c => (
                                      <button 
                                        key={c} 
                                        onClick={() => updateBlock(activeBlock.id, { column: c })} 
                                        className={`flex-1 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all
                                          ${(activeBlock.column || 'left') === c ? 'bg-white shadow-premium text-blue-600 scale-105' : 'text-gray-400 hover:bg-white/50'}`}
                                      >
                                        {c === 'left' ? 'Лево' : 'Право'}
                                      </button>
                                   ))}
                                 </motion.div>
                               )}
                             </div>
                          </div>

                          <div className="space-y-6 pt-6 border-t border-gray-50">
                             <label className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] block">Ширина блока</label>
                             <div className="flex gap-4 p-2 bg-gray-50/50 rounded-[1.5rem] border border-gray-100">
                                {(['full', '1/2'] as const).map(w => (
                                   <button 
                                     key={w} 
                                     onClick={() => updateBlock(activeBlock.id, { width: w })} 
                                     className={`flex-1 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all
                                       ${(activeBlock.width || 'full') === w ? 'bg-white shadow-premium text-blue-600 scale-105' : 'text-gray-400 hover:bg-white/50'}`}
                                   >
                                     {w === 'full' ? '100%' : '50%'}
                                   </button>
                                ))}
                             </div>
                          </div>

                         <div className="space-y-6">
                            <label className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] block">Цветовая схема</label>
                            <div className="grid grid-cols-3 gap-4">
                               {BG_OPTIONS.map(opt => (
                                  <button 
                                    key={opt.value} 
                                    onClick={() => updateDesign(activeBlock.id, { bg: opt.value, textColor: opt.value.includes('white') || opt.value.includes('50') ? 'text-gray-900' : 'text-white' })} 
                                    className={`h-16 rounded-[1.5rem] border-2 transition-all relative group overflow-hidden ${opt.class}
                                      ${activeBlock.design.bg === opt.value ? 'border-blue-600 ring-4 ring-blue-500/10' : 'border-transparent hover:scale-105 shadow-sm'}`}
                                  >
                                     <div className={`absolute bottom-2 left-2 text-[8px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity ${opt.value.includes('900') || opt.value.includes('950') ? 'text-white/50' : 'text-gray-400'}`}>
                                        {opt.label}
                                     </div>
                                  </button>
                               ))}
                            </div>
                         </div>
                         
                         <div className="space-y-6 pt-6 border-t border-gray-50">
                            <label className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] block">Пользовательский акцент</label>
                            <div className="flex gap-6 items-center p-6 bg-white rounded-[2rem] border border-gray-100 shadow-sm">
                               <div className="relative">
                                  <input type="color" className="w-14 h-14 rounded-2xl p-1 bg-white border cursor-pointer shadow-inner" value={activeBlock.design.accentColor || "#3B82F6"} onChange={e => updateDesign(activeBlock.id, { accentColor: e.target.value })} />
                                  <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-blue-600 shadow-lg ring-2 ring-white" />
                               </div>
                               <div>
                                  <span className="text-xs font-mono font-black text-gray-900 uppercase tracking-widest">{activeBlock.design.accentColor}</span>
                                  <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">HEX Code</p>
                               </div>
                            </div>
                         </div>
                      </div>
                   )}
                   </motion.div>
                   </AnimatePresence>
                </div>
                
                <div className="p-8 border-t border-gray-50 bg-gray-50/20">
                   <button 
                     onClick={() => setActiveBlockId(null)} 
                     className="w-full py-5 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 hover:text-blue-600 hover:bg-white hover:shadow-premium rounded-2xl transition-all"
                   >
                     Завершить редактирование
                   </button>
                </div>
             </>
         ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-gray-400 gap-6 bg-gray-50/10">
               <div className="w-24 h-24 rounded-[2.5rem] bg-white shadow-premium flex items-center justify-center text-blue-100 relative">
                  <MousePointerClick size={48} />
                  <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-blue-500 shadow-lg border-4 border-white animate-pulse" />
               </div>
               <div>
                  <p className="text-sm font-black text-gray-900 uppercase tracking-tight">Инспектор готов</p>
                  <p className="text-xs font-medium text-gray-400 mt-2 leading-relaxed">Выберите любой блок на холсте,<br/>чтобы настроить его параметры.</p>
               </div>
            </div>
         )}
      </div>

      <style jsx global>{`
         .thin-scrollbar::-webkit-scrollbar {
           width: 4px;
         }
         .thin-scrollbar::-webkit-scrollbar-track {
           background: transparent;
         }
         .thin-scrollbar::-webkit-scrollbar-thumb {
           background: #E2E8F0;
           border-radius: 20px;
         }
         .thin-scrollbar::-webkit-scrollbar-thumb:hover {
           background: #CBD5E0;
         }
         
         .shadow-premium {
            box-shadow: 0 10px 40px -10px rgba(0,0,0,0.08);
         }
         
         button:active {
            transform: scale(0.98);
         }
      `}</style>
      
       <input 
         type="file" 
         ref={fileInputRef} 
         className="hidden" 
         accept="image/*" 
         onChange={handleImageUpload} 
       />
    </div>
  );
}
