"use client";

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

interface Plan {
  name: string;
  price: string;
  period: string;
  features: string[];
  cta: string;
  ctaLink?: string;
  highlighted?: boolean;
}

interface PricingBlockProps {
  content: {
    title?: string;
    plans: Plan[];
  };
  design: {
    bg: string;
    textColor: string;
    padding: string;
    container: "fixed" | "fluid";
    accentColor?: string;
  };
}

export default function PricingBlock({ content, design }: PricingBlockProps) {
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
            className="text-4xl md:text-5xl font-black text-center mb-20 tracking-tight heading-premium"
          >
            {content.title}
          </motion.h2>
        )}
        
        <div className="flex flex-wrap justify-center gap-8 md:gap-12 items-stretch">
          {content.plans.map((plan, i) => (
            <motion.div 
              key={i} 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              whileHover={{ y: -10 }}
              className={cn(
                "flex-1 min-w-[320px] max-w-[420px] rounded-[3rem] p-10 transition-all relative flex flex-col",
                plan.highlighted 
                  ? "shadow-premium z-10 scale-105 border-2" 
                  : cn("border", isDark ? "bg-white/5 border-white/10" : "bg-white border-gray-100 shadow-bento")
              )}
              style={{ 
                borderColor: plan.highlighted ? accent : undefined,
                backgroundColor: plan.highlighted ? (isDark ? 'rgba(255,255,255,0.08)' : '#fff') : undefined
              }}
            >
              {plan.highlighted && (
                <div 
                  className="absolute -top-5 left-1/2 -translate-x-1/2 px-6 py-2 rounded-full text-xs font-black uppercase tracking-widest text-white shadow-xl"
                  style={{ background: `linear-gradient(135deg, ${accent}, #7EADFF)` }}
                >
                  Популярный выбор
                </div>
              )}

              <div className="mb-8">
                <div className={cn(
                  "text-xs font-black uppercase tracking-[0.2em] mb-4 opacity-50",
                  isDark ? "text-white" : "text-gray-900"
                )}>
                  {plan.name}
                </div>
                <div className="flex items-baseline gap-2">
                  <span className={cn(
                    "text-6xl font-black tracking-tighter",
                    isDark ? "text-white" : "text-gray-900"
                  )}>
                    {plan.price}
                  </span>
                  <span className={cn(
                    "text-lg font-bold opacity-40",
                    isDark ? "text-white" : "text-gray-500"
                  )}>
                    ₽ / {plan.period}
                  </span>
                </div>
              </div>
              
              <div className="space-y-5 mb-12 flex-1">
                {plan.features.map((feat, j) => (
                  <div key={j} className="flex items-start gap-4 group/item">
                    <div className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 transition-colors",
                      plan.highlighted ? "bg-blue-500 text-white" : "bg-blue-50 text-blue-500"
                    )}>
                      <Check size={14} strokeWidth={3} />
                    </div>
                    <span className={cn(
                      "text-base font-semibold transition-colors",
                      isDark ? "text-white/80" : "text-gray-600",
                      "group-hover/item:text-blue-500"
                    )}>
                      {feat}
                    </span>
                  </div>
                ))}
              </div>

              <Link 
                href={plan.ctaLink || "#form"}
                className={cn(
                  "block w-full py-5 rounded-2xl text-center font-black tracking-tight text-lg transition-all shadow-xl hover:shadow-2xl active:scale-95 group overflow-hidden relative",
                  plan.highlighted ? "text-white" : "text-white"
                )}
                style={{
                    background: plan.highlighted ? `linear-gradient(135deg, ${accent}, #7EADFF)` : accent
                }}
              >
                <span className="relative z-10">{plan.cta}</span>
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Background decoration for highlighted state */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full pointer-events-none -z-10 bg-gradient-to-br from-blue-500/5 via-transparent to-transparent opacity-50" />
    </section>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
