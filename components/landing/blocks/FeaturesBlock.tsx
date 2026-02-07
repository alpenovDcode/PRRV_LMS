
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
  
  const gridCols = {
    2: "md:grid-cols-2",
    3: "md:grid-cols-3",
    4: "md:grid-cols-2 lg:grid-cols-4"
  }[content.columns || 3];

  return (
    <section className={`${design.bg} ${design.textColor} ${design.padding}`}>
      <div className={containerClass}>
        <div className={`grid grid-cols-1 ${gridCols} gap-8`}>
          {content.features.map((feature, idx) => {
            const Icon = ICONS[feature.icon || "check"] || CheckCircle;
            
            return (
              <div key={idx} className="bg-white/5 p-6 rounded-xl border border-white/10">
                <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mb-4">
                  <Icon size={24} />
                </div>
                <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
                <p className="opacity-80 leading-relaxed text-sm">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
