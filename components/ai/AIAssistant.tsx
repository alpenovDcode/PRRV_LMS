"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, Send, X, Loader2, User, Sparkles, RotateCcw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

let msgCounter = 0;
function nextId() {
  return `msg-${++msgCounter}-${Date.now()}`;
}

export default function AIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Привет! Я твой ИИ-ассистент. Задай мне любой вопрос по базе знаний Прорыва.",
    },
  ]);
  const [status, setStatus] = useState<"ready" | "submitted" | "streaming">("ready");
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const isLoading = status !== "ready";

  // Auto-scroll on new content
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(async (retryMessages?: ChatMessage[]) => {
    const messagesToSend = retryMessages || messages;
    const userText = retryMessages ? undefined : input.trim();

    if (!retryMessages && !userText) return;
    if (isLoading) return;

    setError(null);

    // Add user message if not retrying
    let allMessages = messagesToSend;
    if (userText) {
      const userMsg: ChatMessage = { id: nextId(), role: "user", content: userText };
      allMessages = [...messagesToSend, userMsg];
      setMessages(allMessages);
      setInput("");
    }

    setStatus("submitted");

    try {
      abortRef.current = new AbortController();

      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: allMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`Ошибка сервера: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error("Не удалось получить поток ответа");

      // Create an empty assistant message
      const assistantId = nextId();
      setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);
      setStatus("streaming");

      let fullContent = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullContent += chunk;

        setMessages((prev) => {
          const updated = [...prev];
          const lastMsg = updated[updated.length - 1];
          if (lastMsg.id === assistantId) {
            updated[updated.length - 1] = { ...lastMsg, content: fullContent };
          }
          return updated;
        });
      }

      setStatus("ready");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setStatus("ready");
        return;
      }
      console.error("[AIAssistant] Error:", err);
      setError(err instanceof Error ? err.message : "Неизвестная ошибка");
      setStatus("ready");
    }
  }, [input, messages, isLoading]);

  const handleRetry = useCallback(() => {
    // Remove the last (failed/empty) assistant message and retry
    const cleaned = messages.filter((m, i) => {
      if (i === messages.length - 1 && m.role === "assistant" && !m.content.trim()) return false;
      return true;
    });
    handleSend(cleaned);
  }, [messages, handleSend]);

  return (
    <div className="fixed bottom-4 right-4 sm:bottom-8 sm:right-8 z-[9999]">
      {/* Floating Button */}
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center shadow-2xl transition-all duration-500
          ${isOpen ? 'bg-white text-blue-600 rotate-90 shadow-blue-500/20' : 'bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-blue-600/40'}`}
      >
        {isOpen ? <X size={28} /> : <Sparkles size={28} />}
      </motion.button>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20, transformOrigin: "bottom right" }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="absolute bottom-16 sm:bottom-20 right-0 w-[calc(100vw-2rem)] sm:w-[420px] h-[calc(100vh-8rem)] sm:h-[650px] max-h-[800px] bg-white rounded-3xl sm:rounded-[2.5rem] shadow-[0_32px_80px_-20px_rgba(0,0,0,0.2)] flex flex-col overflow-hidden border border-gray-200/60 backdrop-blur-3xl"
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
              className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-slate-50/50 thin-scrollbar"
            >
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[85%] sm:max-w-[80%] flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse ml-auto' : 'flex-row mr-auto'}`}>
                    <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full sm:rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm
                      ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gradient-to-br from-indigo-50 to-blue-50 text-blue-600 border border-blue-100/50'}`}
                    >
                      {msg.role === 'user' ? <User size={16} /> : <Bot size={18} />}
                    </div>
                    <div className={`p-4 sm:p-5 rounded-2xl sm:rounded-[1.5rem] text-sm leading-relaxed shadow-sm
                      ${msg.role === 'user'
                        ? 'bg-blue-600 text-white rounded-tr-none'
                        : 'bg-white text-gray-800 rounded-tl-none border border-gray-200'}`}
                    >
                      {msg.role === 'user' ? (
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      ) : (
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm, remarkBreaks]}
                          className="prose prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-gray-900 prose-pre:text-white prose-pre:p-4 prose-pre:rounded-2xl prose-h2:text-lg prose-h2:mt-4 prose-h2:mb-2 prose-h3:text-base prose-h3:mt-3 prose-h3:mb-1 prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-0.5 first:prose-p:mt-0 first:prose-h2:mt-0 last:prose-p:mb-0 text-gray-800"
                        >
                          {msg.content}
                        </ReactMarkdown>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}

              {/* Loading indicator (waiting for first token) */}
              {status === "submitted" && (
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
                    <span className="text-sm text-red-700">Ошибка: {error}</span>
                    <button
                      onClick={handleRetry}
                      className="p-2 bg-red-100 hover:bg-red-200 rounded-xl transition-all text-red-600 flex-shrink-0"
                      title="Повторить"
                    >
                      <RotateCcw size={14} />
                    </button>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Input Area */}
            <div className="p-4 sm:p-5 bg-white border-t border-gray-100 rounded-b-3xl sm:rounded-b-[2.5rem]">
              <div className="relative flex items-center gap-2 sm:gap-3">
                <input
                  type="text"
                  placeholder="Задайте ваш вопрос..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                  disabled={isLoading}
                  className="w-full pl-5 pr-14 py-3.5 sm:py-4 bg-gray-50 border border-gray-200 rounded-2xl sm:rounded-[1.5rem] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:border-blue-400 transition-all disabled:opacity-60 placeholder-gray-400"
                />
                <button
                  onClick={() => handleSend()}
                  disabled={isLoading || !input.trim()}
                  className="absolute right-1.5 p-2.5 sm:p-3 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-xl sm:rounded-2xl hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 transition-all shadow-md mt-[1px]"
                >
                  <Send size={18} />
                </button>
              </div>
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
