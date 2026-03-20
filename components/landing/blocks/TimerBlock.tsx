"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface TimerBlockProps {
  content: {
    title?: string;
    deadline: string;
    style?: "cards" | "simple";
  };
  design: {
    bg: string;
    textColor: string;
    padding: string;
    container: "fixed" | "fluid";
  };
}

export default function TimerBlock({ content, design }: TimerBlockProps) {
  const [timeLeft, setTimeLeft] = useState<{ d: number; h: number; m: number; s: number }>({ d: 0, h: 0, m: 0, s: 0 });

  useEffect(() => {
    const calculateTime = () => {
      const deadline = new Date(content.deadline).getTime();
      const now = new Date().getTime();
      const diff = Math.max(0, deadline - now);

      setTimeLeft({
        d: Math.floor(diff / (1000 * 60 * 60 * 24)),
        h: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        m: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
        s: Math.floor((diff % (1000 * 60)) / 1000),
      });
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [content.deadline]);

  const containerClass = design.container === "fluid" ? "w-full px-6 md:px-12" : "max-w-7xl mx-auto px-6 md:px-12";
  const isDark = design.bg === 'bg-gray-900' || design.bg === 'bg-blue-900';

  return (
    <section className={`${design.bg} ${design.padding} relative overflow-hidden`}>
      <div className={`${containerClass} text-center relative z-10`}>
        {content.title && (
          <motion.p 
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-sm font-black uppercase tracking-[0.2em] opacity-50 mb-12 heading-premium"
          >
            {content.title}
          </motion.p>
        )}
        
        <div className="flex justify-center gap-3 md:gap-8">
          {[
            { label: 'дней', val: timeLeft.d },
            { label: 'часов', val: timeLeft.h },
            { label: 'минут', val: timeLeft.m },
            { label: 'секунд', val: timeLeft.s }
          ].map((item, i) => (
            <motion.div 
              key={i} 
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="flex flex-col items-center"
            >
              <div className={cn(
                "relative flex gap-[2px] md:gap-1 p-2 md:p-4 rounded-3xl border shadow-lg",
                isDark ? "bg-white/5 border-white/10" : "bg-white border-gray-100 shadow-bento"
              )}>
                {/* Each digit gets its own mini-card */}
                {String(item.val).padStart(2, '0').split('').map((digit, dIdx) => (
                  <div 
                    key={dIdx} 
                    className={cn(
                      "w-10 h-14 md:w-16 md:h-24 rounded-xl md:rounded-2xl flex items-center justify-center text-3xl md:text-6xl font-black tabular-nums shadow-sm overflow-hidden relative",
                      isDark ? "bg-white/10 text-white" : "bg-gray-50 text-gray-900"
                    )}
                  >
                    <AnimatePresence mode="popLayout">
                        <motion.span
                          key={digit}
                          initial={{ y: 20, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          exit={{ y: -20, opacity: 0 }}
                          transition={{ duration: 0.3, ease: "easeInOut" }}
                        >
                          {digit}
                        </motion.span>
                    </AnimatePresence>
                    
                    {/* Visual split line for "flip clock" look */}
                    <div className="absolute inset-0 border-b border-black/5 pointer-events-none" style={{ top: '50%' }} />
                  </div>
                ))}
              </div>
              <span className={cn(
                "text-[10px] md:text-xs uppercase font-black mt-4 tracking-widest opacity-40",
                isDark ? "text-white" : "text-gray-900"
              )}>
                {item.label}
              </span>
            </motion.div>
          ))}
        </div>

        {/* Dynamic Pulse for Urgency */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-blue-500/5 rounded-full blur-[100px] animate-pulse pointer-events-none" />
      </div>
    </section>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
