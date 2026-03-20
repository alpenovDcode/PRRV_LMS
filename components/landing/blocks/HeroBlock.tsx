
import Link from 'next/link';

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
  const containerClass = design.container === "fluid" ? "w-full px-4" : "max-w-7xl mx-auto px-4";
  const accent = content.accentColor || "#3B82F6";
  const textCol = content.textColor || (design.textColor === "text-white" ? "#fff" : "#111827");
  
  const style: React.CSSProperties = {
    position: 'relative',
    overflow: 'hidden',
    color: textCol
  };

  if (content.backgroundImage) {
     style.backgroundImage = `url(${content.backgroundImage})`;
     style.backgroundSize = 'cover';
     style.backgroundPosition = 'center';
  }

  const overlayOpacity = content.backgroundImage ? (content.bgOverlay ?? 0.5) : 0;

  return (
    <section 
      className={`${content.backgroundImage ? "" : design.bg} ${design.padding}`}
      style={style}
    >
      {/* Overlay */}
      {content.backgroundImage && (
        <div 
          className="absolute inset-0 z-0" 
          style={{ 
            background: design.bg === 'bg-white' ? '#fff' : (design.bg === 'bg-gray-900' ? '#111' : '#000'), 
            opacity: overlayOpacity 
          }} 
        />
      )}

      {/* Decorative element (optional, matches the builder's style) */}
      {!content.backgroundImage && design.bg !== 'bg-gray-900' && (
        <div 
          className="absolute -top-24 -right-24 w-96 h-96 rounded-full blur-3xl opacity-10 pointer-events-none"
          style={{ background: accent }}
        />
      )}

      <div className={`${containerClass} relative z-10 text-${design.textAlign}`}>
        <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-8 leading-tight">
          {content.title}
        </h1>
        <p className="text-xl md:text-2xl opacity-80 mb-12 max-w-3xl mx-auto leading-relaxed">
          {content.subtitle}
        </p>
        
        {content.ctaText && (
          <Link 
            href={content.ctaLink || "#form"}
            className="inline-flex items-center justify-center px-10 py-5 text-lg font-bold rounded-2xl transition-all shadow-xl hover:shadow-2xl transform hover:-translate-y-1 active:scale-95"
            style={{ 
                background: accent,
                color: '#fff'
            }}
          >
            {content.ctaText}
          </Link>
        )}
      </div>
    </section>
  );
}
