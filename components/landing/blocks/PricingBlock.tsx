import React from 'react';
import Link from 'next/link';

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
  const containerClass = design.container === "fluid" ? "w-full px-4" : "max-w-7xl mx-auto px-4";
  const accent = design.accentColor || "#3B82F6";

  return (
    <section className={`${design.bg} ${design.textColor} ${design.padding}`}>
      <div className={containerClass}>
        {content.title && (
          <h2 className="text-3xl md:text-5xl font-extrabold text-center mb-16">
            {content.title}
          </h2>
        )}
        <div className="flex flex-wrap justify-center gap-8">
          {content.plans.map((plan, i) => (
            <div 
              key={i} 
              className={`flex-1 min-w-[300px] max-w-[400px] rounded-3xl p-8 transition-transform hover:-translate-y-2 border
                ${plan.highlighted 
                  ? 'ring-4 ring-offset-4 shadow-2xl scale-105 z-10' 
                  : 'bg-white/5 border-current/10 shadow-lg'}`}
              style={{ 
                backgroundColor: plan.highlighted ? accent : (design.bg === 'bg-white' ? '#fff' : undefined),
                color: plan.highlighted ? '#fff' : undefined,
                borderColor: plan.highlighted ? accent : undefined,
                boxShadow: plan.highlighted ? `0 20px 50px ${accent}40` : undefined
              }}
            >
              <div className={`text-sm font-bold uppercase tracking-widest mb-4 ${plan.highlighted ? 'opacity-90' : 'opacity-50'}`}>
                {plan.name}
              </div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-5xl font-black">{plan.price} ₽</span>
                <span className={`text-sm ${plan.highlighted ? 'opacity-80' : 'opacity-50'}`}>/ {plan.period}</span>
              </div>
              
              <div className="space-y-4 my-8">
                {plan.features.map((feat, j) => (
                  <div key={j} className="flex items-start gap-3">
                    <span className={plan.highlighted ? 'text-white' : 'text-blue-500'}>✓</span>
                    <span className="text-sm font-medium">{feat}</span>
                  </div>
                ))}
              </div>

              <Link 
                href={plan.ctaLink || "#form"}
                className={`block w-full py-4 rounded-xl text-center font-bold transition-all
                  ${plan.highlighted 
                    ? 'bg-white text-gray-900 hover:bg-gray-100 shadow-lg' 
                    : 'bg-blue-600 text-white hover:bg-blue-700 shadow-md'}`}
                style={{
                    backgroundColor: !plan.highlighted ? accent : undefined
                }}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
