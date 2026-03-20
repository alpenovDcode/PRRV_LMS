
import { CheckCircle, Zap, Star, Shield, Layout, Settings } from 'lucide-react';

interface FeatureItem {
  title: string;
  description: string;
  icon?: string; // "check", "zap", "star", etc.
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
    textAlign: "left" | "center" | "right"; // Not used heavily here, mostly for container logic
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
  const containerClass = design.container === "fluid" ? "w-full px-4" : "max-w-7xl mx-auto px-4";
  
  // Support both content.features and content.items
  const items = (content as any).items || content.features || [];
  const title = (content as any).title;

  const cols = content.columns || 3;
  const gridCols = {
    2: "md:grid-cols-2",
    3: "md:grid-cols-3",
    4: "md:grid-cols-2 lg:grid-cols-4"
  }[cols as 2 | 3 | 4];

  return (
    <section className={`${design.bg} ${design.textColor} ${design.padding}`}>
      <div className={containerClass}>
        {title && (
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
            {title}
          </h2>
        )}
        <div className={`grid grid-cols-1 ${gridCols} gap-6 md:gap-8`}>
          {items.map((feature: any, idx: number) => {
            const Icon = ICONS[feature.icon] || CheckCircle;
            
            return (
              <div 
                key={idx} 
                className="bg-white/5 p-8 rounded-3xl border border-current/10 hover:shadow-xl transition-all group"
                style={{ background: design.bg === 'bg-white' ? '#fff' : undefined }}
              >
                <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-inner">
                  {typeof feature.icon === 'string' && !ICONS[feature.icon] ? (
                    <span className="text-2xl">{feature.icon}</span>
                  ) : (
                    <Icon size={28} />
                  )}
                </div>
                <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                <p className="opacity-70 leading-relaxed text-sm">
                  {feature.description || feature.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
