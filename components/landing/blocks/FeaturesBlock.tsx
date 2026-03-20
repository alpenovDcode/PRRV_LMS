"use client";

import { motion } from 'framer-motion';
import { CheckCircle, Zap, Star, Shield, Layout, Settings, LucideIcon } from 'lucide-react';

interface FeatureItem {
  title: string;
  description: string;
  icon?: string | LucideIcon;
}

interface FeaturesBlockProps {
  content: {
    features: FeatureItem[];
    columns: 2 | 3 | 4;
  };
  design: {
    bg: string;
    textColor: string;
    padding: string;
    container: "fixed" | "fluid";
    textAlign: "left" | "center" | "right";
  };
}

const ICONS: Record<string, any> = {
  check: CheckCircle,
  zap: Zap,
  star: Star,
  shield: Shield,
  layout: Layout,
  settings: Settings
};

export default function FeaturesBlock({ content, design }: FeaturesBlockProps) {
  const containerClass = design.container === "fluid" ? "w-full px-6 md:px-12" : "max-w-7xl mx-auto px-6 md:px-12";
  
  const items = (content as any).items || content.features || [];
  const title = (content as any).title;

  const cols = content.columns || 3;
  const gridCols = {
    2: "md:grid-cols-2",
    3: "md:grid-cols-3",
    4: "md:grid-cols-2 lg:grid-cols-4"
  }[cols as 2 | 3 | 4];

  const isDark = design.bg === 'bg-gray-900' || design.bg === 'bg-blue-900';

  return (
    <section className={`${design.bg} ${design.padding} relative overflow-hidden`}>
      <div className={containerClass}>
        {title && (
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl md:text-5xl font-black text-center mb-16 tracking-tight heading-premium"
          >
            {title}
          </motion.h2>
        )}
        
        <div className={`grid grid-cols-1 ${gridCols} gap-6 md:gap-10`}>
          {items.map((feature: any, idx: number) => {
            const Icon = typeof feature.icon === 'string' ? (ICONS[feature.icon] || CheckCircle) : (feature.icon || CheckCircle);
            
            return (
              <motion.div 
                key={idx} 
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                whileHover={{ y: -8 }}
                className={cn(
                  "p-8 rounded-[2rem] transition-all group relative overflow-hidden",
                  isDark 
                    ? "bg-white/5 border border-white/10 hover:bg-white/10" 
                    : "bg-white border border-gray-100 shadow-bento hover:shadow-premium"
                )}
              >
                {/* Decorative background glow */}
                <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl group-hover:bg-blue-500/10 transition-colors" />
                
                <div className={cn(
                  "w-16 h-16 rounded-2xl flex items-center justify-center mb-8 transition-transform group-hover:scale-110 shadow-inner",
                  isDark ? "bg-white/10 text-blue-400" : "bg-blue-50 text-blue-600"
                )}>
                  {typeof feature.icon === 'string' && !ICONS[feature.icon] ? (
                    <span className="text-3xl">{feature.icon}</span>
                  ) : (
                    <Icon size={32} strokeWidth={2.5} />
                  )}
                </div>

                <h3 className={cn(
                  "text-2xl font-black mb-4 tracking-tight",
                  isDark ? "text-white" : "text-gray-900"
                )}>
                  {feature.title}
                </h3>
                
                <p className={cn(
                   "leading-relaxed text-base font-medium",
                   isDark ? "text-white/60" : "text-gray-500"
                )}>
                  {feature.description || feature.desc}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
