"use client";

import { useRef, useEffect, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, Send, X, Loader2, User, Sparkles, RotateCcw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";

export default function AIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    error,
    reload,
  } = useChat({
    api: "/api/ai/chat",
    initialMessages: [
      {
        id: "welcome",
        role: "assistant",
        content: "Привет! Я твой ИИ-ассистент. Задай мне любой вопрос по базе знаний Прорыва.",
      },
    ],
  });

  // Auto-scroll on new content
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="fixed bottom-8 right-8 z-[9999]">
      {/* Floating Button */}
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-16 h-16 rounded-full flex items-center justify-center shadow-2xl transition-all duration-500
          ${isOpen ? 'bg-white text-blue-600 rotate-90 shadow-blue-500/20' : 'bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-blue-600/40'}`}
      >
        {isOpen ? <X size={32} /> : <Sparkles size={32} />}
      </motion.button>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20, transformOrigin: "bottom right" }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="absolute bottom-20 right-0 w-[400px] h-[600px] bg-white rounded-[3rem] shadow-[0_32px_80px_-20px_rgba(0,0,0,0.15)] flex flex-col overflow-hidden border border-gray-100 backdrop-blur-3xl"
          >
            {/* Header */}
            <div className="p-8 bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-between shadow-lg relative z-10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center ring-1 ring-white/30">
                  <Bot size={28} />
                </div>
                <div>
                  <h3 className="font-black text-lg uppercase tracking-tight">ИИ-Помощник</h3>
                  <div className="flex items-center gap-1.5 opacity-80 mt-0.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Онлайн</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-3 hover:bg-white/20 rounded-2xl transition-all"
              >
                <X size={20} />
              </button>
            </div>

            {/* Messages Area */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-8 space-y-6 bg-gray-50/30 thin-scrollbar"
            >
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[85%] flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm
                      ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white text-gray-400 border border-gray-100'}`}
                    >
                      {msg.role === 'user' ? <User size={18} /> : <Bot size={18} />}
                    </div>
                    <div className={`p-5 rounded-[2rem] text-sm leading-relaxed shadow-sm
                      ${msg.role === 'user'
                        ? 'bg-white text-gray-900 rounded-tr-none border border-blue-50/50'
                        : 'bg-white text-gray-800 rounded-tl-none border border-gray-100'}`}
                    >
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkBreaks]}
                        className="prose prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-gray-900 prose-pre:text-white prose-pre:p-4 prose-pre:rounded-2xl"
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                </motion.div>
              ))}

              {/* Loading indicator */}
              {isLoading && messages[messages.length - 1]?.role === "user" && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white border border-gray-100 flex items-center justify-center text-blue-500 shadow-sm">
                    <Loader2 size={18} className="animate-spin" />
                  </div>
                  <div className="bg-white/50 backdrop-blur-sm p-4 rounded-3xl border border-gray-100">
                    <div className="flex gap-1.5">
                      <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                      <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                      <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce" />
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Error state with retry */}
              {error && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                  <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3 max-w-[85%]">
                    <span className="text-sm text-red-700">Ошибка при получении ответа.</span>
                    <button
                      onClick={() => reload()}
                      className="p-2 bg-red-100 hover:bg-red-200 rounded-xl transition-all text-red-600"
                      title="Повторить"
                    >
                      <RotateCcw size={14} />
                    </button>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Input Area */}
            <div className="p-6 bg-white border-t border-gray-50">
              <form onSubmit={handleSubmit} className="relative flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Ваш вопрос..."
                  value={input}
                  onChange={handleInputChange}
                  className="w-full pl-6 pr-14 py-5 bg-gray-50 border border-gray-100 rounded-[2rem] text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:bg-white focus:border-blue-200 transition-all shadow-inner"
                />
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="absolute right-2 p-4 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-2xl hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 transition-all shadow-lg shadow-blue-600/20"
                >
                  <Send size={20} />
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx global>{`
        .thin-scrollbar::-webkit-scrollbar { width: 4px; }
        .thin-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .thin-scrollbar::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 20px; }
        .thin-scrollbar::-webkit-scrollbar-thumb:hover { background: #CBD5E0; }
      `}</style>
    </div>
  );
}
