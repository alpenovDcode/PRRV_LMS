
import Link from 'next/link';

interface HeroBlockProps {
  content: {
    title: string;
    subtitle: string;
    ctaText: string;
    ctaLink: string;
    backgroundImage?: string;
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
  
  // Dynamic styles based on design prop
  const style: React.CSSProperties = {};
  if (content.backgroundImage) {
     style.backgroundImage = `url(${content.backgroundImage})`;
     style.backgroundSize = 'cover';
     style.backgroundPosition = 'center';
  }

  const bgClass = content.backgroundImage ? "bg-gray-900/50 bg-blend-overlay" : design.bg;

  return (
    <section 
      className={`${bgClass} ${design.textColor} ${design.padding}`}
      style={style}
    >
      <div className={`${containerClass} text-${design.textAlign}`}>
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-6">
          {content.title}
        </h1>
        <p className="text-lg md:text-xl opacity-90 mb-8 max-w-2xl mx-auto">
          {content.subtitle}
        </p>
        
        {content.ctaText && (
          <Link 
            href={content.ctaLink || "#"}
            className="inline-flex items-center justify-center px-8 py-4 text-base font-medium rounded-full bg-blue-600 text-white hover:bg-blue-700 transition duration-150 ease-in-out shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
          >
            {content.ctaText}
          </Link>
        )}
      </div>
    </section>
  );
}
