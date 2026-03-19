"use client";

import React, { useState, useEffect, useMemo } from "react";
import { 
  Plus, Trash, ArrowUp, ArrowDown, Type, AlignJustify, Video, 
  LayoutTemplate, Check, CheckSquare, MousePointerClick, Image as ImageIcon,
  Settings, Palette as PaletteIcon, GripVertical, ChevronRight, X, MessageSquare, RefreshCw,
  Clock, Quote, CreditCard, Minus, Monitor, Tablet, Smartphone, ExternalLink,
  Save, Globe, Smartphone as MobileIcon, Eye, ChevronDown, Star
} from "lucide-react";
import { v4 as uuidv4 } from 'uuid';
import RichTextEditor from "@/components/landing/RichTextEditor";
import { Stream } from "@cloudflare/stream-react";

// --- TYPES ---

interface BlockDesign {
  padding?: string;
  bg?: string;
  textColor?: string;
  textAlign?: "left" | "center" | "right";
  buttonStyle?: "solid" | "outline" | "ghost";
}

interface Block {
  id: string;
  type: string;
  content: any;
  design: BlockDesign;
  settings?: any;
}

interface ColorPalette {
  id: string;
  name: string;
  surface: string;
  accent: string;
  button: string;
  text: string;
}

// --- CONSTANTS ---

const COLOR_PALETTES: ColorPalette[] = [
  { id: "dark", name: "Premium Dark", surface: "#1A1A14", accent: "#FFD700", button: "#FFD700", text: "#FFFFFF" },
  { id: "light", name: "Clean Light", surface: "#FFFFFF", accent: "#1A1A14", button: "#1A1A14", text: "#1A1A14" },
  { id: "soft", name: "Soft Nature", surface: "#F5F4EE", accent: "#4A5D4E", button: "#4A5D4E", text: "#1A1A14" },
  { id: "blue", name: "Modern Blue", surface: "#F0F7FF", accent: "#0066FF", button: "#0066FF", text: "#1A1A14" },
];

const DEFAULT_BLOCKS: Block[] = [
  {
    id: "hero-1",
    type: "hero",
    content: {
      title: "Ваше уникальное торговое предложение",
      subtitle: "Дополнительное описание, которое раскрывает ценность продукта и убеждает пользователя оставить заявку.",
      button: { text: "Начать обучение", link: "#", enabled: true }
    },
    design: { padding: "py-24", bg: "#FFFFFF" }
  }
];

// --- COMPONENTS ---

const BlockPreview = ({ block, palette }: { block: Block, palette: ColorPalette }) => {
  const { type, content, design } = block;
  
  const bg = design?.bg || palette.surface;
  const isDark = bg === "#1A1A14" || (design?.bg === "" && palette.id === "dark");

  const containerStyle: React.CSSProperties = {
    paddingTop: design?.padding?.includes("py-") ? parseInt(design.padding.split("-")[1]) * 4 : 80,
    paddingBottom: design?.padding?.includes("py-") ? parseInt(design.padding.split("-")[1]) * 4 : 80,
    backgroundColor: bg,
    color: isDark ? "#fff" : "#1A1A14",
    position: "relative",
    overflow: "hidden"
  };

  switch (type) {
    case "hero":
      return (
        <div style={containerStyle} className="px-8 text-center min-h-[60vh] flex items-center justify-center">
          {content.backgroundImage && (
            <>
              <div 
                className="absolute inset-0 bg-cover bg-center z-0" 
                style={{ backgroundImage: `url(${content.backgroundImage})` }} 
              />
              <div 
                className="absolute inset-0 z-10" 
                style={{ backgroundColor: `rgba(0,0,0,${content.bgOverlay || 0})` }} 
              />
            </>
          )}
          <div className="max-w-4xl mx-auto relative z-20">
            <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-8 leading-[1.1]" style={{ color: content.backgroundImage ? "#fff" : "inherit" }}>
              {content.title}
            </h1>
            <p className="text-xl opacity-70 mb-12 max-w-2xl mx-auto leading-relaxed" style={{ color: content.backgroundImage ? "#fff" : "inherit" }}>
              {content.subtitle}
            </p>
            {content.button?.enabled && (
              <button 
                style={{ backgroundColor: palette.button, color: palette.id === "dark" ? "#000" : "#fff" }}
                className="px-10 py-5 rounded-2xl font-black text-lg shadow-2xl hover:scale-105 transition-transform"
              >
                {content.button.text}
              </button>
            )}
          </div>
        </div>
      );
    case "text":
      return (
        <div style={containerStyle} className="px-8">
           <div className="max-w-3xl mx-auto prose prose-xl" dangerouslySetInnerHTML={{ __html: content.body || "Введите текст..." }} />
        </div>
      );
    case "features":
      return (
        <div style={containerStyle} className="px-8 text-center">
           <div className="max-w-6xl mx-auto">
             <h2 className="text-4xl font-black mb-16">{content.title}</h2>
             <div className="grid md:grid-cols-3 gap-8">
               {content.features?.map((f: any, i: number) => (
                 <div key={i} className="p-10 rounded-[40px] bg-black/5 hover:bg-black/10 transition-colors text-left border border-black/5">
                    <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center mb-6 shadow-sm"><Plus size={24} /></div>
                    <h3 className="text-xl font-bold mb-4">{f.title}</h3>
                    <p className="opacity-60 leading-relaxed">{f.description}</p>
                 </div>
               ))}
             </div>
           </div>
        </div>
      );
    case "button":
       return (
         <div style={containerStyle} className="px-8 text-center">
            <button 
              style={{ backgroundColor: palette.button, color: palette.id === "dark" ? "#000" : "#fff" }}
              className="px-12 py-6 rounded-2xl font-black text-xl shadow-xl hover:scale-110 active:scale-95 transition-all"
            >
              {content.text}
            </button>
         </div>
       );
     case "video":
        return (
          <div style={containerStyle} className="px-8">
             <div className="max-w-5xl mx-auto aspect-video bg-black rounded-[40px] overflow-hidden shadow-2xl relative group">
                {content.videoId ? (
                  <Stream
                    src={content.videoId}
                    controls
                    width="100%"
                    height="100%"
                    className="w-full h-full"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gray-900 text-white/40">
                    <Video size={48} className="mb-4 opacity-20" />
                    <p className="text-xs font-bold uppercase tracking-widest">Введите ID видео Cloudflare в редакторе</p>
                  </div>
                )}
             </div>
          </div>
        );
     case "image":
        return (
          <div style={containerStyle} className="px-8">
             <div className="max-w-5xl mx-auto rounded-[40px] overflow-hidden shadow-2xl border border-black/5">
                <img src={content.url || "https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&q=80&w=2070"} className="w-full h-auto min-h-[100px] object-cover" alt="Block content" />
             </div>
          </div>
        );
     case "reviews":
        return (
          <div style={containerStyle} className="px-8 text-center">
            <div className="max-w-6xl mx-auto">
              <h2 className="text-4xl font-black mb-16">{content.title || "Отзывы наших учеников"}</h2>
              <div className="grid md:grid-cols-2 gap-8">
                {content.reviews?.map((r: any, i: number) => (
                  <div key={i} className="p-10 rounded-[40px] bg-white border border-black/5 text-left shadow-xl hover:-translate-y-2 transition-transform">
                     <div className="flex gap-1 mb-6 text-[#FFD700]">
                        <Star size={16} fill="currentColor" />
                        <Star size={16} fill="currentColor" />
                        <Star size={16} fill="currentColor" />
                        <Star size={16} fill="currentColor" />
                        <Star size={16} fill="currentColor" />
                     </div>
                     <p className="text-lg italic mb-8 opacity-80 leading-relaxed">"{r.text}"</p>
                     <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center font-bold text-gray-400">{r.author?.[0]}</div>
                        <div>
                           <div className="font-bold text-[#1A1A14]">{r.author}</div>
                           <div className="text-sm opacity-50 text-[#1A1A14]">{r.role}</div>
                        </div>
                     </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
     case "pricing":
        return (
          <div style={containerStyle} className="px-8 text-center">
            <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-8">
              {content.plans?.map((item: any, i: number) => (
                <div key={i} style={{ background: item.best ? palette.accent : "rgba(0,0,0,0.03)", color: item.best ? "#fff" : "inherit" }} className="p-10 rounded-[48px] border border-black/5 transition-all hover:scale-[1.03] flex flex-col">
                  <h3 style={{ fontSize: 14, fontWeight: 800, textTransform: "uppercase", marginBottom: 8, opacity: 0.7 }}>{item.name}</h3>
                  <div style={{ fontSize: 40, fontWeight: 800, marginBottom: 24 }}>{item.price}</div>
                  <div className="flex-1 space-y-3 mb-10 text-left">
                    {item.features?.map((f: string, fi: number) => <div key={fi} className="text-[14px] flex items-center gap-2"><Check size={14} className="opacity-50" /> {f}</div>)}
                    {(!item.features || item.features.length === 0) && <div className="text-[14px] opacity-40 italic">Добавьте преимущества в редакторе</div>}
                  </div>
                  <button style={{ width: "100%", padding: "18px", borderRadius: 100, border: "none", background: item.best ? "#fff" : palette.accent, color: item.best ? palette.accent : "#fff", fontWeight: 800, cursor: "pointer", fontSize: 14, textTransform: "uppercase", letterSpacing: 1 }} className="shadow-lg active:scale-95 transition-all">{item.cta || "Выбрать"}</button>
                </div>
              ))}
            </div>
          </div>
        );
     case "timer":
        return (
          <div style={containerStyle} className="px-8 text-center">
            <div className="max-w-4xl mx-auto">
               <h2 className="text-2xl font-black mb-8">{content.title || "До конца акции:"}</h2>
               <div className="flex justify-center gap-6">
                  {['Дней', 'Часов', 'Минут', 'Секунд'].map(unit => (
                    <div key={unit} className="flex flex-col items-center">
                       <div className="w-20 h-24 bg-[#1A1A14] text-white rounded-2xl flex items-center justify-center text-3xl font-black shadow-xl mb-2">00</div>
                       <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">{unit}</span>
                    </div>
                  ))}
               </div>
            </div>
          </div>
        );
     case "divider":
        return (
          <div style={containerStyle} className="px-8">
             <div className="max-w-5xl mx-auto">
                {content.style === "none" ? (
                   <div className="h-12" />
                ) : (
                   <div style={{ borderTop: `2px ${content.style || 'solid'} rgba(0,0,0,0.1)` }} />
                )}
             </div>
          </div>
        );
    }
  };

const AddBtn = ({ onClick, label }: { onClick: () => void, label: string }) => (
   <button 
      onClick={onClick}
      className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-dashed border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition group"
   >
      <Plus className="text-gray-400 group-hover:text-blue-500 mb-2" />
      <span className="text-xs font-bold text-gray-500 group-hover:text-blue-600">{label}</span>
   </button>
)

const TabBtn = ({ active, onClick, children }: { active: boolean, onClick: () => void, children: React.ReactNode }) => (
   <button 
      onClick={onClick}
      className={`px-4 py-2 text-sm font-bold rounded-lg transition ${active ? 'bg-blue-600 text-white shadow-lg' : 'hover:bg-gray-100 text-gray-500'}`}
   >
      {children}
   </button>
)

const Input = ({ label, value, onChange, placeholder }: any) => (
   <div className="space-y-1">
      <label className="text-xs font-bold text-gray-500 uppercase">{label}</label>
      <input 
         className="w-full p-2 border rounded text-sm bg-white text-gray-900 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all"
         value={value || ""}
         onChange={e => onChange(e.target.value)}
         placeholder={placeholder}
      />
   </div>
)

const TextArea = ({ label, value, onChange, placeholder }: any) => {
   return (
      <div className="space-y-1">
         <label className="text-xs font-bold text-gray-500 uppercase">{label}</label>
         <textarea 
            className="w-full p-2 border rounded text-sm bg-white text-gray-900 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all h-24 placeholder:text-gray-400"
            value={value || ""}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
         />
      </div>
   )
}

// --- NEW DESIGN SUBCOMPONENTS ---

const styles = {
  input: {
    width: "100%", padding: "10px 14px", background: "#F5F4EE", border: "1.5px solid #E8E8E0",
    borderRadius: "10px", fontSize: "13px", color: "#1A1A14", outline: "none", transition: "all 0.2s",
  },
  label: {
    fontSize: "11px", fontWeight: "800", color: "#888", textTransform: "uppercase" as const,
    letterSpacing: "0.08em", marginBottom: "6px", display: "block"
  },
  inputSmall: {
    width: "100%", padding: "8px 12px", background: "#fff", border: "1.5px solid #E8E8E0",
    borderRadius: "12px", fontSize: "12px", color: "#1A1A14", outline: "none"
  },
  select: {
    width: "100%", padding: "10px 14px", background: "#F5F4EE", border: "1.5px solid #E8E8E0",
    borderRadius: "10px", fontSize: "13px", color: "#1A1A14", outline: "none", cursor: "pointer"
  }
};

export default function LandingConstructor({
  lessons,
}: {
  lessons: any[];
}) {
  const [blocks, setBlocks] = useState<Block[]>(DEFAULT_BLOCKS);
  const [isPublished, setIsPublished] = useState(false);
  const [settings, setSettings] = useState<any>({
    title: "",
    slug: "",
    bitrix: { enabled: false, targetStageId: "", globalAnswerFieldId: "" }
  });

  // Bitrix states
  const [bitrixFunnels, setBitrixFunnels] = useState<any[]>([]);
  const [bitrixFields, setBitrixFields] = useState<any[]>([]);
  const [loadingFunnels, setLoadingFunnels] = useState(false);
  const [loadingFields, setLoadingFields] = useState(false);
  const [expandedFunnelId, setExpandedFunnelId] = useState<string | null>(null);

  // UI state
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"content" | "design">("content");
  const [sidePanel, setSidePanel] = useState<"blocks"|"palette"|"settings"|"editor"|null>("blocks");
  const [previewDevice, setPreviewDevice] = useState<"desktop"|"tablet"|"mobile">("desktop");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [bitrixOpen, setBitrixOpen] = useState(false);
  const [palette, setPalette] = useState<ColorPalette>(COLOR_PALETTES[0]);
  const [deletingBlockId, setDeletingBlockId] = useState<string | null>(null);

  useEffect(() => {
    // Load existing landing data if needed
  }, []);

  const saveLanding = async () => {
    // Logic to save landing
    alert("Лендинг успешно сохранен!");
  };

  const addBlock = (type: string) => {
    const newBlock: Block = {
      id: uuidv4(),
      type,
      content: getInitialContent(type),
      design: { padding: "py-24", bg: "" } // Leave bg empty to follow palette by default
    };
    setBlocks([...blocks, newBlock]);
    setActiveBlockId(newBlock.id);
    setSidePanel("editor");
  };

  const getInitialContent = (type: string) => {
    switch (type) {
      case "hero":
        return { 
          title: "Заголовок", 
          subtitle: "Подзаголовок", 
          button: { text: "Кнопка", enabled: true, link: "#" },
          backgroundImage: "",
          bgOverlay: 0.4
        };
      case "text":
        return { body: "<p>Ваш текст здесь...</p>" };
      case "features":
        return { 
          title: "Преимущества", 
          features: [
            { title: "Преимущество 1", description: "Описание преимущества", icon: "check" },
            { title: "Преимущество 2", description: "Описание преимущества", icon: "check" }
          ] 
        };
      case "button":
        return { text: "Нажать здесь", link: "#" };
      case "video":
        return { videoId: "" };
      case "image":
        return { url: "" };
      case "reviews":
        return { 
          title: "Отзывы", 
          reviews: [
            { author: "Имя Фамилия", role: "Студент", text: "Отличный курс!" }
          ] 
        };
      case "pricing":
        return { 
          title: "Тарифы", 
          plans: [
            { name: "Базовый", price: "5000₽", features: ["Доступ к урокам"], cta: "Купить", best: false }
          ] 
        };
      case "timer":
        return { title: "До конца акции:", targetDate: new Date(Date.now() + 86400000).toISOString() };
      case "divider":
        return { style: "solid" };
      default:
        return {};
    }
  };
  
  const updateContent = (id: string, contentUpdates: any) => {
    setBlocks(blocks.map(b => b.id === id ? { ...b, content: { ...b.content, ...contentUpdates } } as Block : b));
  };

  const updateDesign = (id: string, designUpdates: Partial<BlockDesign>) => {
    setBlocks(blocks.map(b => b.id === id ? { 
      ...b, 
      design: { ...b.design, ...designUpdates } 
    } as Block : b));
  };

  const removeBlock = (id: string) => {
    setBlocks(blocks.filter(b => b.id !== id));
    if (activeBlockId === id) setActiveBlockId(null);
    setDeletingBlockId(null);
  };

  const moveBlock = (index: number, direction: -1 | 1) => {
    const newBlocks = [...blocks];
    if (index + direction < 0 || index + direction >= newBlocks.length) return;
    
    [newBlocks[index], newBlocks[index + direction]] = [newBlocks[index + direction], newBlocks[index]];
    setBlocks(newBlocks);
  };

  const activeBlock = blocks.find(b => b.id === activeBlockId);

  return (
    <div className="flex h-screen bg-[#FDFDFC] text-[#1A1A14] font-sans selection:bg-[#FFD700] selection:text-[#1A1A14] overflow-hidden">
      
      {/* 1. PRIMARY NAVIGATION SIDEBAR */}
      <div className="w-[80px] border-r border-[#E8E8E0] bg-white flex flex-col items-center py-8 gap-6 z-40 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <div className="w-12 h-12 bg-[#1A1A14] rounded-2xl flex items-center justify-center mb-4 cursor-pointer hover:rotate-6 transition-transform group">
          <div className="w-6 h-6 bg-[#FFD700] rounded-sm group-hover:scale-110 transition-transform"></div>
        </div>
        
        <div className="flex-1 flex flex-col gap-3">
          <button onClick={() => setSidePanel(sidePanel === "blocks" ? null : "blocks")} className={`w-12 h-12 flex items-center justify-center rounded-2xl transition-all ${sidePanel === "blocks" ? "bg-[#1A1A14] text-white shadow-lg scale-110" : "text-[#888] hover:bg-[#F5F4EE]"}`} title="Библиотека блоков"><Plus size={22} /></button>
          <button onClick={() => setSidePanel(sidePanel === "palette" ? null : "palette")} className={`w-12 h-12 flex items-center justify-center rounded-2xl transition-all ${sidePanel === "palette" ? "bg-[#1A1A14] text-white shadow-lg scale-110" : "text-[#888] hover:bg-[#F5F4EE]"}`} title="Цветовая палитра"><PaletteIcon size={22} /></button>
          <button onClick={() => setSidePanel(sidePanel === "settings" ? null : "settings")} className={`w-12 h-12 flex items-center justify-center rounded-2xl transition-all ${sidePanel === "settings" ? "bg-[#1A1A14] text-white shadow-lg scale-110" : "text-[#888] hover:bg-[#F5F4EE]"}`} title="Глобальные настройки"><Settings size={22} /></button>
        </div>

        <div className="flex flex-col gap-3 mt-auto">
          <button onClick={() => setPreviewOpen(true)} className="w-12 h-12 flex items-center justify-center rounded-2xl text-[#888] hover:bg-[#F5F4EE] transition-all" title="Предпросмотр"><Eye size={22} /></button>
          <button onClick={() => setBitrixOpen(true)} className="w-12 h-12 flex items-center justify-center rounded-2xl text-[#888] hover:bg-[#F5F4EE] transition-all" title="Bitrix24"><RefreshCw size={22} /></button>
          <button onClick={saveLanding} className="w-12 h-12 flex items-center justify-center rounded-2xl bg-[#FFD700] text-[#1A1A14] shadow-lg hover:scale-110 active:scale-95 transition-all" title="Сохранить"><Save size={22} /></button>
        </div>
      </div>

      {/* 2. SECONDARY PANEL (Dynamic content: Library, Palette, Settings, Editor) */}
      <div className={`border-r border-[#E8E8E0] bg-white flex flex-col z-30 transition-all duration-500 ease-in-out ${sidePanel ? "w-[400px] opacity-100 translate-x-0" : "w-0 opacity-0 -translate-x-10 pointer-events-none"}`}>
        
        {/* Block Library */}
        {sidePanel === "blocks" && (
          <div className="flex-1 flex flex-col overflow-hidden p-8 animate-in slide-in-from-left duration-300">
            <h3 className="text-[20px] font-extrabold tracking-tight mb-8">Библиотека блоков</h3>
            <div className="grid grid-cols-2 gap-3 overflow-y-auto pr-2 custom-scrollbar">
              {[
                { type: "hero", label: "Hero", icon: AlignJustify },
                { type: "text", label: "Текст", icon: Type },
                { type: "features", label: "Карточки", icon: LayoutTemplate },
                { type: "button", label: "Кнопка", icon: MousePointerClick },
                { type: "video", label: "Видео", icon: Video },
                { type: "image", label: "Изображение", icon: ImageIcon },
                { type: "reviews", label: "Отзывы", icon: Quote },
                { type: "pricing", label: "Тарифы", icon: CreditCard },
                { type: "timer", label: "Таймер", icon: Clock },
                { type: "divider", label: "Разделитель", icon: Minus },
              ].map(item => (
                <button key={item.type} onClick={() => addBlock(item.type)} className="flex flex-col items-center justify-center p-6 rounded-[24px] bg-[#F9F9F7] border border-transparent hover:border-[#1A1A14] hover:bg-white hover:shadow-xl transition-all group">
                  <item.icon size={24} className="mb-3 text-[#888] group-hover:text-[#1A1A14] transition-colors" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-[#888] group-hover:text-[#1A1A14]">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Color Palette */}
        {sidePanel === "palette" && (
          <div className="flex-1 flex flex-col overflow-hidden p-8 animate-in slide-in-from-left duration-300">
            <h3 className="text-[20px] font-extrabold tracking-tight mb-8">Цветовая палитра</h3>
            <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar">
              {COLOR_PALETTES.map(p => (
                <button key={p.id} onClick={() => setPalette(p)} className={`w-full p-6 rounded-[24px] border-2 flex items-center justify-between transition-all ${palette.id === p.id ? "border-[#1A1A14] bg-white shadow-xl scale-[1.02]" : "border-[#F5F4EE] bg-[#F9F9F7] hover:border-[#E8E8E0]"}`}>
                  <div className="flex flex-col items-start">
                    <span className="text-[14px] font-bold">{p.name}</span>
                    <div className="flex items-center gap-1 mt-2">
                      <div className="w-4 h-4 rounded-full border border-black/5" style={{ background: p.surface }} />
                      <div className="w-4 h-4 rounded-full border border-black/5" style={{ background: p.accent }} />
                      <div className="w-4 h-4 rounded-full border border-black/5" style={{ background: p.button }} />
                    </div>
                  </div>
                  {palette.id === p.id && <div className="w-6 h-6 bg-[#1A1A14] rounded-full flex items-center justify-center"><Check size={14} className="text-white" /></div>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Global Settings */}
        {sidePanel === "settings" && (
          <div className="flex-1 flex flex-col overflow-hidden p-8 animate-in slide-in-from-left duration-300">
            <h3 className="text-[20px] font-extrabold tracking-tight mb-8">Настройки лендинга</h3>
            <div className="space-y-10 overflow-y-auto pr-2 custom-scrollbar">
              <div className="space-y-4">
                <label style={styles.label}>Заголовок страницы (SEO)</label>
                <input style={styles.input} value={settings?.title || ""} onChange={e => setSettings({...settings, title: e.target.value})} placeholder="Напр: Лучший курс по веб-дизайну" />
              </div>
              <div className="space-y-4">
                <label style={styles.label}>Slug (URL страницы)</label>
                <input style={styles.input} value={settings?.slug || ""} onChange={e => setSettings({...settings, slug: e.target.value})} placeholder="course-name" />
                <p className="text-[11px] text-[#888] font-medium leading-relaxed">Адрес лендинга будет: proryv.ru/landings/{settings?.slug || "..."}</p>
              </div>
            </div>
          </div>
        )}

        {/* Block Editor */}
        {sidePanel === "editor" && (
          <div className="flex-1 flex flex-col overflow-hidden animate-in slide-in-from-left duration-300">
            <div className="p-8 pb-0 flex items-center justify-between">
              <h3 className="text-[20px] font-extrabold tracking-tight">Редактор блока</h3>
              <button onClick={() => setSidePanel(null)} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-[#F5F4EE] text-[#888] transition-colors"><X size={18}/></button>
            </div>
            
            <div className="px-8 mt-6">
              <div className="flex bg-[#F5F4EE] p-1 rounded-2xl">
                <button onClick={() => setActiveTab("content")} className={`flex-1 py-3 text-[11px] font-black tracking-widest uppercase rounded-xl transition-all ${activeTab === "content" ? "bg-white text-[#1A1A14] shadow-sm" : "text-[#888] hover:text-[#1A1A14]"}`}>Контент</button>
                <button onClick={() => setActiveTab("design")} className={`flex-1 py-3 text-[11px] font-black tracking-widest uppercase rounded-xl transition-all ${activeTab === "design" ? "bg-white text-[#1A1A14] shadow-sm" : "text-[#888] hover:text-[#1A1A14]"}`}>Дизайн</button>
              </div>
            </div>

            {activeBlock ? (
              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                {activeTab === "content" && (
                  <div className="space-y-10 animate-in fade-in duration-500">
                    {/* HERO EDITOR */}
                    {activeBlock.type === "hero" && (
                      <div className="space-y-6">
                        <div className="space-y-2">
                          <label style={styles.label}>Заголовок</label>
                          <textarea style={styles.input} value={activeBlock.content.title} onChange={e => updateContent(activeBlock.id, { title: e.target.value })} rows={3} />
                        </div>
                        <div className="space-y-2">
                          <label style={styles.label}>Подзаголовок</label>
                          <textarea style={styles.input} value={activeBlock.content.subtitle} onChange={e => updateContent(activeBlock.id, { subtitle: e.target.value })} rows={3} />
                        </div>
                        <div className="space-y-4">
                           <div className="flex items-center justify-between">
                              <label style={styles.label}>Кнопка</label>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-[#888] uppercase">Показать</span>
                                <input type="checkbox" checked={activeBlock.content.button?.enabled} onChange={e => updateContent(activeBlock.id, { button: {...activeBlock.content.button, enabled: e.target.checked} })} />
                              </div>
                           </div>
                           {activeBlock.content.button?.enabled && (
                             <>
                               <input style={styles.input} value={activeBlock.content.button.text} onChange={e => updateContent(activeBlock.id, { button: {...activeBlock.content.button, text: e.target.value} })} placeholder="Текст кнопки" />
                               <input style={styles.input} value={activeBlock.content.button.link} onChange={e => updateContent(activeBlock.id, { button: {...activeBlock.content.button, link: e.target.value} })} placeholder="Ссылка (ID блока или URL)" />
                             </>
                           )}
                        </div>
                        <div className="pt-6 border-t border-[#E8E8E0] space-y-4">
                           <div className="space-y-2">
                              <label style={styles.label}>Фоновое изображение (URL)</label>
                              <input style={styles.input} value={activeBlock.content.backgroundImage || ""} onChange={e => updateContent(activeBlock.id, { backgroundImage: e.target.value })} placeholder="https://example.com/image.jpg" />
                           </div>
                           <div className="space-y-2">
                              <div className="flex justify-between items-center">
                                 <label style={styles.label}>Затемнение фона</label>
                                 <span className="text-[10px] font-bold text-[#1A1A14]">{Math.round((activeBlock.content.bgOverlay || 0) * 100)}%</span>
                              </div>
                              <input type="range" min="0" max="1" step="0.05" className="w-full h-1 bg-[#F5F4EE] rounded-lg appearance-none cursor-pointer accent-[#1A1A14]" value={activeBlock.content.bgOverlay || 0} onChange={e => updateContent(activeBlock.id, { bgOverlay: parseFloat(e.target.value) })} />
                           </div>
                        </div>
                      </div>
                    )}
                    
                    {/* TEXT EDITOR */}
                    {activeBlock.type === "text" && (
                      <div className="space-y-6">
                        <label style={styles.label}>Основной текст</label>
                        <RichTextEditor content={activeBlock.content.body} onChange={v => updateContent(activeBlock.id, { body: v })} />
                      </div>
                    )}

                    {/* FEATURES EDITOR */}
                    {activeBlock.type === "features" && (
                      <div className="space-y-8">
                        <div className="space-y-2">
                          <label style={styles.label}>Заголовок секции</label>
                          <input style={styles.input} value={activeBlock.content.title} onChange={e => updateContent(activeBlock.id, { title: e.target.value })} />
                        </div>
                        <div className="space-y-4">
                           <label style={styles.label}>Карточки ({activeBlock.content.features?.length})</label>
                           {activeBlock.content.features?.map((f: any, i: number) => (
                              <div key={i} className="p-6 bg-[#F9F9F7] rounded-3xl border border-[#E8E8E0] relative group/item">
                                 <button onClick={() => updateContent(activeBlock.id, { features: activeBlock.content.features.filter((_: any, idx: number) => idx !== i) })} className="absolute top-4 right-4 text-[#888] hover:text-[#FF4D4D] opacity-0 group-hover/item:opacity-100 transition-all"><X size={14}/></button>
                                 <div className="space-y-4">
                                   <input style={styles.inputSmall} value={f.title} onChange={e => {
                                      const nf = [...activeBlock.content.features];
                                      nf[i].title = e.target.value;
                                      updateContent(activeBlock.id, { features: nf });
                                   }} />
                                   <textarea style={styles.inputSmall} value={f.description} rows={2} onChange={e => {
                                      const nf = [...activeBlock.content.features];
                                      nf[i].description = e.target.value;
                                      updateContent(activeBlock.id, { features: nf });
                                   }} />
                                 </div>
                              </div>
                           ))}
                           <button onClick={() => updateContent(activeBlock.id, { features: [...activeBlock.content.features, { title: "Новая карточка", description: "Описание", icon: "check" }] })} className="w-full py-3 border-2 border-dashed border-[#E8E8E0] rounded-2xl text-[11px] font-bold text-[#888] hover:border-[#1A1A14] hover:text-[#1A1A14] transition-all">+ ДОБАВИТЬ КАРТОЧКУ</button>
                        </div>
                      </div>
                    )}

                    {/* VIDEO EDITOR */}
                    {activeBlock.type === "video" && (
                      <div className="space-y-6">
                        <label style={styles.label}>Cloudflare Video ID</label>
                        <input style={styles.input} value={activeBlock.content.videoId || ""} onChange={e => updateContent(activeBlock.id, { videoId: e.target.value })} placeholder="5d5b37240439..." />
                      </div>
                    )}

                    {/* IMAGE EDITOR */}
                    {activeBlock.type === "image" && (
                      <div className="space-y-6">
                        <label style={styles.label}>URL изображения</label>
                        <input style={styles.input} value={activeBlock.content.url || ""} onChange={e => updateContent(activeBlock.id, { url: e.target.value })} placeholder="https://..." />
                      </div>
                    )}

                    {/* REVIEWS EDITOR */}
                    {activeBlock.type === "reviews" && (
                      <div className="space-y-8">
                        <div className="space-y-2">
                          <label style={styles.label}>Заголовок секции</label>
                          <input style={styles.input} value={activeBlock.content.title || ""} onChange={e => updateContent(activeBlock.id, { title: e.target.value })} />
                        </div>
                        <div className="space-y-4">
                           <label style={styles.label}>Отзывы ({activeBlock.content.reviews?.length})</label>
                           {activeBlock.content.reviews?.map((r: any, i: number) => (
                              <div key={i} className="p-6 bg-[#F9F9F7] rounded-3xl border border-[#E8E8E0] relative group/item">
                                 <button onClick={() => updateContent(activeBlock.id, { reviews: activeBlock.content.reviews.filter((_: any, idx: number) => idx !== i) })} className="absolute top-4 right-4 text-[#888] hover:text-[#FF4D4D] opacity-0 group-hover/item:opacity-100 transition-all"><X size={14}/></button>
                                 <div className="space-y-4">
                                   <input style={styles.inputSmall} value={r.author} placeholder="Имя Фамилия" onChange={e => {
                                      const nr = [...activeBlock.content.reviews];
                                      nr[i].author = e.target.value;
                                      updateContent(activeBlock.id, { reviews: nr });
                                   }} />
                                   <input style={styles.inputSmall} value={r.role} placeholder="Роль (напр. Студент)" onChange={e => {
                                      const nr = [...activeBlock.content.reviews];
                                      nr[i].role = e.target.value;
                                      updateContent(activeBlock.id, { reviews: nr });
                                   }} />
                                   <textarea style={styles.inputSmall} value={r.text} rows={3} placeholder="Текст отзыва" onChange={e => {
                                      const nr = [...activeBlock.content.reviews];
                                      nr[i].text = e.target.value;
                                      updateContent(activeBlock.id, { reviews: nr });
                                   }} />
                                 </div>
                              </div>
                           ))}
                           <button onClick={() => updateContent(activeBlock.id, { reviews: [...(activeBlock.content.reviews || []), { author: "Новый автор", role: "Роль", text: "Текст отзыва" }] })} className="w-full py-3 border-2 border-dashed border-[#E8E8E0] rounded-2xl text-[11px] font-bold text-[#888] hover:border-[#1A1A14] hover:text-[#1A1A14] transition-all">+ ДОБАВИТЬ ОТЗЫВ</button>
                        </div>
                      </div>
                    )}

                    {/* PRICING EDITOR */}
                    {activeBlock.type === "pricing" && (
                      <div className="space-y-8">
                         <div className="space-y-4">
                           <label style={styles.label}>Тарифы ({activeBlock.content.plans?.length})</label>
                           {activeBlock.content.plans?.map((p: any, i: number) => (
                              <div key={i} className="p-6 bg-[#F9F9F7] rounded-3xl border border-[#E8E8E0] relative group/item">
                                 <button onClick={() => updateContent(activeBlock.id, { plans: activeBlock.content.plans.filter((_: any, idx: number) => idx !== i) })} className="absolute top-4 right-4 text-[#888] hover:text-[#FF4D4D] opacity-0 group-hover/item:opacity-100 transition-all"><X size={14}/></button>
                                 <div className="space-y-4">
                                   <div className="flex gap-2">
                                      <input style={styles.inputSmall} value={p.name} placeholder="Название" onChange={e => {
                                         const np = [...activeBlock.content.plans];
                                         np[i].name = e.target.value;
                                         updateContent(activeBlock.id, { plans: np });
                                      }} />
                                      <input style={styles.inputSmall} value={p.price} placeholder="Цена" onChange={e => {
                                         const np = [...activeBlock.content.plans];
                                         np[i].price = e.target.value;
                                         updateContent(activeBlock.id, { plans: np });
                                      }} />
                                   </div>
                                   <div className="flex items-center gap-2">
                                      <span className="text-[10px] font-bold text-[#888] uppercase">Выделить (Best)</span>
                                      <input type="checkbox" checked={p.best} onChange={e => {
                                         const np = [...activeBlock.content.plans];
                                         np[i].best = e.target.checked;
                                         updateContent(activeBlock.id, { plans: np });
                                      }} />
                                   </div>
                                 </div>
                              </div>
                           ))}
                           <button onClick={() => updateContent(activeBlock.id, { plans: [...(activeBlock.content.plans || []), { name: "Новый тариф", price: "0₽", features: [], cta: "Купить", best: false }] })} className="w-full py-3 border-2 border-dashed border-[#E8E8E0] rounded-2xl text-[11px] font-bold text-[#888] hover:border-[#1A1A14] hover:text-[#1A1A14] transition-all">+ ДОБАВИТЬ ТАРИФ</button>
                        </div>
                      </div>
                    )}

                    {/* TIMER EDITOR */}
                    {activeBlock.type === "timer" && (
                      <div className="space-y-6">
                        <div className="space-y-2">
                          <label style={styles.label}>Заголовок таймера</label>
                          <input style={styles.input} value={activeBlock.content.title || ""} onChange={e => updateContent(activeBlock.id, { title: e.target.value })} placeholder="До конца акции:" />
                        </div>
                        <div className="space-y-2">
                          <label style={styles.label}>Дата окончания (ISO)</label>
                          <input type="datetime-local" style={styles.input} value={activeBlock.content.targetDate?.slice(0, 16) || ""} onChange={e => updateContent(activeBlock.id, { targetDate: new Date(e.target.value).toISOString() })} />
                        </div>
                      </div>
                    )}

                    {/* DIVIDER EDITOR */}
                    {activeBlock.type === "divider" && (
                      <div className="space-y-6">
                        <label style={styles.label}>Стиль линии</label>
                        <select style={styles.select} value={activeBlock.content.style || "solid"} onChange={e => updateContent(activeBlock.id, { style: e.target.value })}>
                           <option value="solid">Сплошная</option>
                           <option value="dashed">Пунктир</option>
                           <option value="none">Пустое пространство</option>
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "design" && (
                  <div className="space-y-10 animate-in fade-in duration-500">
                    <div className="space-y-4">
                      <label style={styles.label}>Фон блока</label>
                      <div className="grid grid-cols-6 gap-3">
                        {["", "#FFFFFF", "#FDFDFC", "#F5F4EE", "#1A1A14", palette.surface, palette.accent].map(c => (
                          <button key={c} onClick={() => updateDesign(activeBlock.id, { bg: c })} className={`w-8 h-8 rounded-full border-2 transition-all ${activeBlock.design?.bg === c ? "border-[#1A1A14] scale-125 shadow-md" : "border-transparent hover:scale-110"}`} style={{ background: c || "transparent", position: "relative" }}>
                            {c === "" && <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black leading-none">A</div>}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] font-bold text-[#888] uppercase tracking-wider">A - Автоматический (по палитре)</p>
                    </div>
                    <div className="space-y-4">
                      <label style={styles.label}>Наружные отступы</label>
                      <select style={styles.select} value={activeBlock.design?.padding} onChange={e => updateDesign(activeBlock.id, { padding: e.target.value })}>
                        <option value="py-12">Компактные</option>
                        <option value="py-24">Стандартные</option>
                        <option value="py-40">Просторные</option>
                      </select>
                    </div>
                  </div>
                )}

                <div className="pt-12 mt-12 border-t border-[#E8E8E0]">
                  <button onClick={() => setDeletingBlockId(activeBlock.id)} className="w-full py-5 text-[11px] font-black text-[#FF4D4D] border-2 border-[#FF4D4D]/10 rounded-2xl hover:bg-[#FF4D4D] hover:text-white transition-all uppercase tracking-[2px]">Удалить блок</button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-[#888] p-12 text-center opacity-40 select-none">
                <div className="w-20 h-20 bg-[#F5F4EE] rounded-[32px] flex items-center justify-center mb-6">
                  <MousePointerClick size={32} />
                </div>
                <p className="text-[13px] font-bold uppercase tracking-widest leading-loose">Выберите блок<br/>для редактирования</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. MAIN CANVAS (Preview Area) */}
      <div className="flex-1 bg-[#F5F4EE] relative flex flex-col items-center overflow-hidden">
        {/* Device Switcher */}
        <div className="h-14 w-full bg-white border-b border-[#E8E8E0] flex items-center justify-center gap-2 z-20">
          <button onClick={() => setPreviewDevice("desktop")} className={`p-2 rounded-lg transition-all ${previewDevice === "desktop" ? "bg-[#1A1A14] text-white shadow-md" : "text-[#888] hover:bg-[#F5F4EE]"}`}><Monitor size={18} /></button>
          <button onClick={() => setPreviewDevice("tablet")} className={`p-2 rounded-lg transition-all ${previewDevice === "tablet" ? "bg-[#1A1A14] text-white shadow-md" : "text-[#888] hover:bg-[#F5F4EE]"}`}><Tablet size={18} /></button>
          <button onClick={() => setPreviewDevice("mobile")} className={`p-2 rounded-lg transition-all ${previewDevice === "mobile" ? "bg-[#1A1A14] text-white shadow-md" : "text-[#888] hover:bg-[#F5F4EE]"}`}><Smartphone size={18} /></button>
        </div>

        {/* Scrollable Area */}
        <div className="flex-1 w-full overflow-y-auto p-12 flex flex-col items-center custom-scrollbar">
          <div 
            className="bg-white shadow-[0_30px_100px_rgba(0,0,0,0.08)] transition-all duration-500 overflow-hidden" 
            style={{ 
              width: previewDevice === "desktop" ? "100%" : previewDevice === "tablet" ? "768px" : "375px",
              maxWidth: "1100px",
              minHeight: "100%",
              borderRadius: previewDevice === "desktop" ? "0" : "24px"
            }}
          >
            {blocks.map((block, index) => (
              <div 
                key={block.id} 
                className={`relative group transition-all ${activeBlockId === block.id ? "ring-2 ring-[#1A1A14] z-10" : "hover:ring-1 hover:ring-[#E8E8E0] hover:z-0"}`}
                onClick={() => { setActiveBlockId(block.id); setSidePanel("editor"); }}
              >
                 <BlockPreview block={block} palette={palette} />
                 
                 {/* Action Overlay */}
                 <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                    {deletingBlockId === block.id ? (
                      <div className="flex items-center gap-1 bg-white p-1 rounded-xl shadow-xl border border-[#FF4D4D]/20 animate-in fade-in zoom-in duration-200">
                        <span className="text-[10px] font-bold text-[#FF4D4D] px-2 uppercase tracking-tight">Удалить?</span>
                        <button onClick={(e) => { e.stopPropagation(); setDeletingBlockId(null); }} className="px-3 py-1.5 bg-[#F5F4EE] text-[#1A1A14] rounded-lg text-[10px] font-bold hover:bg-[#E8E8E0] transition-colors">НЕТ</button>
                        <button onClick={(e) => { e.stopPropagation(); removeBlock(block.id); }} className="px-3 py-1.5 bg-[#FF4D4D] text-white rounded-lg text-[10px] font-bold hover:bg-[#E60000] transition-colors shadow-lg shadow-[#FF4D4D]/20">ДА</button>
                      </div>
                    ) : (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); moveBlock(index, -1); }} className="w-8 h-8 flex items-center justify-center bg-white border border-[#E8E8E0] rounded-lg shadow-sm hover:border-[#1A1A14] transition-colors"><ArrowUp size={14} /></button>
                        <button onClick={(e) => { e.stopPropagation(); moveBlock(index, 1); }} className="w-8 h-8 flex items-center justify-center bg-white border border-[#E8E8E0] rounded-lg shadow-sm hover:border-[#1A1A14] transition-colors"><ArrowDown size={14} /></button>
                        <button onClick={(e) => { e.stopPropagation(); setDeletingBlockId(block.id); }} className="ml-2 w-8 h-8 flex items-center justify-center bg-white border border-[#FF4D4D]/20 text-[#FF4D4D] rounded-lg shadow-sm hover:bg-[#FF4D4D] hover:text-white transition-all"><Trash size={14} /></button>
                      </>
                    )}
                 </div>
              </div>
            ))}

            {blocks.length === 0 && (
               <div className="py-40 text-center">
                  <div className="w-20 h-20 bg-[#F5F4EE] rounded-[32px] flex items-center justify-center mb-6 mx-auto">
                    <Plus size={32} className="text-[#888]" />
                  </div>
                  <p className="text-[13px] font-bold text-[#888] uppercase tracking-widest">Начните добавлять блоки<br/>из библиотеки слева</p>
               </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. BITRIX MODAL */}
      {bitrixOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-end bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="w-full max-w-lg h-full bg-white shadow-2xl animate-in slide-in-from-right duration-500 overflow-y-auto">
             <div className="p-8 border-b border-[#E8E8E0] flex items-center justify-between sticky top-0 bg-white z-10">
                <h3 className="text-[24px] font-extrabold tracking-tight">Синхронизация Bitrix24</h3>
                <button onClick={() => setBitrixOpen(false)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-[#F5F4EE] hover:bg-[#E8E8E0] transition-colors"><X size={20}/></button>
             </div>

             <div className="p-8 space-y-10">
                {/* Status Toggle */}
                <div className="flex items-center justify-between p-6 bg-[#F5F4EE] rounded-3xl border border-[#E8E8E0]">
                   <div>
                      <div className="font-bold text-[15px]">Активный канал</div>
                      <div className="text-[11px] text-[#888] mt-0.5">Передавать заявки в CRM</div>
                   </div>
                   <button onClick={() => setSettings({...settings, bitrix: {...settings.bitrix, enabled: !settings.bitrix?.enabled}})} className={`w-14 h-8 rounded-full transition-all relative ${settings.bitrix?.enabled ? "bg-[#1A1A14]" : "bg-[#DDD]"}`}>
                      <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all shadow-sm ${settings.bitrix?.enabled ? "left-7" : "left-1"}`} />
                   </button>
                </div>

                {settings.bitrix?.enabled && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="space-y-4">
                       <label style={styles.label}>Целевая стадия (ID)</label>
                       <div className="flex gap-2">
                          <input style={styles.input} placeholder="C14:NEW" value={settings.bitrix?.targetStageId || ""} onChange={e => setSettings({...settings, bitrix: {...settings.bitrix, targetStageId: e.target.value}})} />
                          <button onClick={() => {
                             setLoadingFunnels(true);
                             fetch('/api/bitrix/funnels').then(r => r.json()).then(d => { if(Array.isArray(d)) setBitrixFunnels(d); }).finally(() => setLoadingFunnels(false));
                          }} className="px-5 bg-[#1A1A14] text-white rounded-xl text-[11px] font-bold hover:scale-105 transition-transform flex items-center gap-2">
                             <RefreshCw size={14} className={loadingFunnels ? "animate-spin" : ""} /> {loadingFunnels ? "..." : "СИНХРОНИЗИРОВАТЬ"}
                          </button>
                       </div>
                    </div>

                    {bitrixFunnels.length > 0 && (
                       <div className="space-y-4">
                          <label style={styles.label}>Доступные воронки</label>
                          <div className="grid gap-2">
                             {bitrixFunnels.map(f => (
                                <div key={f.id} className="border border-[#E8E8E0] rounded-3xl overflow-hidden">
                                   <button onClick={() => setExpandedFunnelId(expandedFunnelId === f.id ? null : f.id)} className="w-full flex items-center justify-between p-6 bg-[#F9F9F7] hover:bg-[#F0F0E8] transition-colors">
                                      <span className="font-bold text-[14px]">{f.name}</span>
                                      <ChevronDown size={18} className={`transition-transform duration-300 ${expandedFunnelId === f.id ? "rotate-180" : ""}`} />
                                   </button>
                                   {expandedFunnelId === f.id && (
                                      <div className="p-3 grid gap-2 border-t border-[#E8E8E0] bg-white">
                                         {f.stages.map((s: any) => (
                                            <button key={s.id} onClick={() => setSettings({...settings, bitrix: {...settings.bitrix, targetStageId: s.id}})} className={`flex items-center justify-between p-4 rounded-2xl text-[12px] transition-all ${settings.bitrix?.targetStageId === s.id ? "bg-[#1A1A14] text-white shadow-lg" : "hover:bg-[#F5F4EE]"}`}>
                                               <span className="font-bold">{s.name}</span>
                                               <span className="opacity-50 font-mono text-[10px]">{s.id}</span>
                                            </button>
                                         ))}
                                      </div>
                                   )}
                                </div>
                             ))}
                          </div>
                       </div>
                    )}
                  </div>
                )}
             </div>
             
             <div className="p-8 border-t border-[#E8E8E0] sticky bottom-0 bg-white shadow-[0_-8px_24px_rgba(0,0,0,0.02)]">
                <button onClick={() => setBitrixOpen(false)} className="w-full py-6 bg-[#1A1A14] text-white rounded-2xl font-black text-[14px] tracking-[2px] hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl">ГОТОВО</button>
             </div>
          </div>
        </div>
      )}

      {/* 5. FULL PREVIEW MODAL */}
      {previewOpen && (
        <div className="fixed inset-0 z-[200] bg-white overflow-y-auto animate-in slide-in-from-bottom duration-500">
          <div className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-[#E8E8E0] px-8 py-4 flex items-center justify-between z-50">
             <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-[#FFD700] rounded-xl flex items-center justify-center font-black">P</div>
                <h2 className="font-extrabold text-[20px] tracking-tight">Предпросмотр</h2>
             </div>
             <button onClick={() => setPreviewOpen(false)} className="px-8 py-3 bg-[#1A1A14] text-white rounded-xl text-[13px] font-bold hover:scale-105 transition-transform active:scale-95 shadow-lg">ЗАКРЫТЬ</button>
          </div>
          <div className="max-w-screen-xl mx-auto">
             {blocks.map(block => <BlockPreview key={block.id} block={block} palette={palette} />)}
          </div>
        </div>
      )}

    </div>
  );
}
