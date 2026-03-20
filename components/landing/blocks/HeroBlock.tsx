"use client";

import Link from 'next/link';
import { motion } from 'framer-motion';

interface HeroBlockProps {
  content: {
    title: string;
    subtitle: string;
    ctaText: string;
    ctaLink: string;
    backgroundImage?: string;
    bgOverlay?: number;
    accentColor?: string;
    textColor?: string;
  };
  design: {
    bg: string;
    textColor: string;
    padding: string;
    container: "fixed" | "fluid";
    textAlign: "left" | "center" | "right";
  };
}

export default function HeroBlock({ content, design }: HeroBlockProps) {
  const containerClass = design.container === "fluid" ? "w-full px-6 md:px-12" : "max-w-7xl mx-auto px-6 md:px-12";
  const accent = content.accentColor || "#3B82F6";
  const textCol = content.textColor || (design.textColor === "text-white" ? "#fff" : "#0f172a");
  
  const sectionStyle: React.CSSProperties = {
    position: 'relative',
    overflow: 'hidden',
    color: textCol,
    minHeight: '60vh',
    display: 'flex',
    alignItems: 'center'
  };

  if (content.backgroundImage) {
     sectionStyle.backgroundImage = `url(${content.backgroundImage})`;
     sectionStyle.backgroundSize = 'cover';
     sectionStyle.backgroundPosition = 'center';
  }

  const overlayOpacity = content.backgroundImage ? (content.bgOverlay ?? 0.6) : 0;

  return (
    <section 
      className={`${content.backgroundImage ? "" : design.bg} ${design.padding} relative`}
      style={sectionStyle}
    >
      {/* Background Overlay or Dynamic Gradient */}
      {content.backgroundImage ? (
        <div 
          className="absolute inset-0 z-0" 
          style={{ 
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.2), rgba(0,0,0,0.8))',
            backgroundColor: design.bg === 'bg-white' ? 'transparent' : 'rgba(0,0,0,0.4)',
            opacity: overlayOpacity 
          }} 
        />
      ) : (
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
           <div 
             className="absolute -top-[20%] -right-[10%] w-[60%] h-[80%] rounded-full blur-[120px] opacity-20 animate-float"
             style={{ background: accent }}
           />
           <div 
             className="absolute -bottom-[10%] -left-[10%] w-[40%] h-[60%] rounded-full blur-[100px] opacity-10 animate-float"
             style={{ background: '#7EADFF', animationDelay: '2s' }}
           />
        </div>
      )}

      <div className={`${containerClass} relative z-10 w-full`}>
        <div className={design.textAlign === 'center' ? 'max-w-4xl mx-auto text-center' : design.textAlign === 'right' ? 'ml-auto text-right max-w-3xl' : 'text-left max-w-3xl'}>
          
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <h1 className="text-5xl md:text-8xl font-black heading-premium tracking-tighter mb-8 leading-[0.9] drop-shadow-sm">
              {content.title}
            </h1>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          >
            <p className="text-lg md:text-2xl opacity-90 mb-12 leading-relaxed font-medium">
              {content.subtitle}
            </p>
          </motion.div>
          
          {content.ctaText && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              <Link 
                href={content.ctaLink || "#form"}
                className="inline-flex items-center justify-center px-12 py-6 text-xl font-bold rounded-full transition-all shadow-2xl hover:shadow-primary/40 transform hover:-translate-y-1 active:scale-95 group relative overflow-hidden"
                style={{ 
                    background: accent,
                    color: '#fff'
                }}
              >
                <span className="relative z-10">{content.ctaText}</span>
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
              </Link>
            </motion.div>
          )}
        </div>
      </div>

      {/* Modern Wave or Curve Bottom (Optional Decorative) */}
      {!content.backgroundImage && (
        <div className="absolute bottom-0 left-0 w-full h-24 bg-gradient-to-t from-white/50 to-transparent pointer-events-none" />
      )}
    </section>
  );
}
