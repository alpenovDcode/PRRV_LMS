"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { Quote } from 'lucide-react';

interface Review {
  name: string;
  role: string;
  text: string;
  avatar?: string;
}

interface ReviewsBlockProps {
  content: {
    title?: string;
    items: Review[];
  };
  design: {
    bg: string;
    textColor: string;
    padding: string;
    container: "fixed" | "fluid";
    accentColor?: string;
  };
}

export default function ReviewsBlock({ content, design }: ReviewsBlockProps) {
  const containerClass = design.container === "fluid" ? "w-full px-6 md:px-12" : "max-w-7xl mx-auto px-6 md:px-12";
  const accent = design.accentColor || "#3B82F6";
  const isDark = design.bg === 'bg-gray-900' || design.bg === 'bg-blue-900';

  return (
    <section className={`${design.bg} ${design.padding} relative overflow-hidden`}>
      <div className={containerClass}>
        {content.title && (
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl md:text-5xl font-black text-center mb-16 tracking-tight heading-premium"
          >
            {content.title}
          </motion.h2>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-6xl mx-auto">
          {content.items.map((review, i) => (
            <motion.div 
              key={i} 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              whileHover={{ y: -5 }}
              className={cn(
                "p-10 rounded-[2.5rem] relative overflow-hidden group transition-all",
                isDark 
                  ? "bg-white/5 border border-white/10 hover:bg-white/10" 
                  : "bg-white border border-gray-100 shadow-bento hover:shadow-premium"
              )}
            >
              {/* Decorative Quote Icon */}
              <div className="absolute top-8 right-8 text-blue-500/10 group-hover:text-blue-500/20 transition-colors">
                <Quote size={64} fill="currentColor" />
              </div>

              <div className="relative z-10">
                <p className={cn(
                  "text-xl leading-relaxed mb-10 font-medium italic",
                  isDark ? "text-white/90" : "text-gray-700"
                )}>
                  "{review.text}"
                </p>
                
                <div className="flex items-center gap-5">
                  <div 
                    className="w-16 h-16 rounded-2xl flex items-center justify-center font-black text-2xl text-white shadow-xl transform group-hover:rotate-3 transition-transform"
                    style={{ background: `linear-gradient(135deg, ${accent}, #7EADFF)` }}
                  >
                    {review.avatar?.startsWith('http') ? (
                       <img src={review.avatar} alt={review.name} className="w-full h-full object-cover rounded-2xl" />
                    ) : (
                       review.avatar || review.name[0]
                    )}
                  </div>
                  <div>
                    <div className={cn(
                      "font-black text-lg tracking-tight",
                      isDark ? "text-white" : "text-gray-900"
                    )}>
                      {review.name}
                    </div>
                    <div className={cn(
                      "text-sm font-bold opacity-50 tracking-wide uppercase",
                      isDark ? "text-white" : "text-gray-500"
                    )}>
                      {review.role}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
