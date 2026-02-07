
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

interface ButtonBlockProps {
  content: {
    text: string;
    link: string;
    variant: "primary" | "secondary" | "outline";
    size: "sm" | "md" | "lg";
    isExternal: boolean;
  };
  design: {
    bg: string;
    padding: string;
    container: "fixed" | "fluid";
    textAlign: "left" | "center" | "right";
  };
}

export default function ButtonBlock({ content, design }: ButtonBlockProps) {
  const containerClass = design.container === "fluid" ? "w-full px-4" : "max-w-7xl mx-auto px-4";
  
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 shadow-md",
    secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200",
    outline: "border-2 border-current hover:bg-gray-50/10"
  };

  const sizes = {
    sm: "px-4 py-2 text-sm",
    md: "px-6 py-3 text-base",
    lg: "px-10 py-4 text-lg font-semibold"
  };

  const Component = content.isExternal ? 'a' : Link;

  return (
    <section className={`${design.bg} ${design.padding}`}>
      <div className={`${containerClass} text-${design.textAlign}`}>
        <Component
          href={content.link || "#"}
          target={content.isExternal ? "_blank" : undefined}
          className={`inline-flex items-center gap-2 rounded-full transition-all duration-200 transform hover:-translate-y-0.5 ${variants[content.variant]} ${sizes[content.size]}`}
        >
          {content.text}
          <ArrowRight size={16} />
        </Component>
      </div>
    </section>
  );
}
