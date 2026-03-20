import React from 'react';

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
  const containerClass = design.container === "fluid" ? "w-full px-4" : "max-w-7xl mx-auto px-4";
  const accent = design.accentColor || "#3B82F6";

  return (
    <section className={`${design.bg} ${design.textColor} ${design.padding}`}>
      <div className={containerClass}>
        {content.title && (
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
            {content.title}
          </h2>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {content.items.map((review, i) => (
            <div 
              key={i} 
              className="bg-white/5 backdrop-blur-sm border border-current/10 rounded-3xl p-8 relative overflow-hidden group hover:shadow-xl transition-all"
              style={{ background: design.bg === 'bg-white' ? '#fff' : undefined }}
            >
              <div 
                className="absolute top-0 left-0 w-1 h-full" 
                style={{ background: accent }}
              />
              <div className="text-4xl opacity-20 mb-4 font-serif">“</div>
              <p className="text-lg leading-relaxed mb-8 opacity-90">
                {review.text}
              </p>
              <div className="flex items-center gap-4">
                <div 
                  className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-white shadow-inner"
                  style={{ background: accent }}
                >
                  {review.avatar || review.name[0]}
                </div>
                <div>
                  <div className="font-bold">{review.name}</div>
                  <div className="text-sm opacity-60">{review.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
