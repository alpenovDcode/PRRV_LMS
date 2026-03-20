import React, { useState, useEffect } from 'react';

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

  const containerClass = design.container === "fluid" ? "w-full px-4" : "max-w-7xl mx-auto px-4";

  return (
    <section className={`${design.bg} ${design.textColor} ${design.padding}`}>
      <div className={`${containerClass} text-center`}>
        {content.title && (
          <p className="text-sm font-bold uppercase tracking-widest opacity-60 mb-8">
            {content.title}
          </p>
        )}
        <div className="flex justify-center gap-4 md:gap-8">
          {[
            { label: 'дней', val: timeLeft.d },
            { label: 'часов', val: timeLeft.h },
            { label: 'минут', val: timeLeft.m },
            { label: 'секунд', val: timeLeft.s }
          ].map((item, i) => (
            <div key={i} className="flex flex-col items-center">
              <div className="bg-white/10 backdrop-blur-sm border border-current/10 rounded-2xl p-4 md:p-6 min-w-[80px] md:min-w-[100px] shadow-sm">
                <span className="text-3xl md:text-5xl font-bold tabular-nums">
                  {String(item.val).padStart(2, '0')}
                </span>
              </div>
              <span className="text-[10px] md:text-xs uppercase font-bold mt-3 opacity-50 tracking-wider">
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
