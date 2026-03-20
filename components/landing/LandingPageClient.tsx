"use client";

import { useState, useEffect } from "react";
import LandingForm from "./LandingForm";
import HeroBlock from "./blocks/HeroBlock";
import FeaturesBlock from "./blocks/FeaturesBlock";
import ButtonBlock from "./blocks/ButtonBlock";
import TimerBlock from "./blocks/TimerBlock";
import ReviewsBlock from "./blocks/ReviewsBlock";
import PricingBlock from "./blocks/PricingBlock";
import DividerBlock from "./blocks/DividerBlock";
import { trackLandingView } from "@/app/actions/landing";

interface WrapperProps {
  slug: string;
  blocks: any[]; 
  initialSubmissions?: Record<string, any>;
  settings?: any;
}

export default function LandingPageClient({ slug, blocks, initialSubmissions = {}, settings = {} }: WrapperProps) {
  // Global state for answers from Text Blocks
  // Key: blockId, Value: text answer
  const [answers, setAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    // Track view using Server Action
    const track = async () => {
      try {
        await trackLandingView(slug);
      } catch (err) {
        console.error("View tracking error:", err);
      }
    };
    
    track();
  }, [slug]);

  const handleAnswerChange = (blockId: string, text: string) => {
    setAnswers(prev => ({ ...prev, [blockId]: text }));
  };

  // Global palette support
  const palette = settings?.palette || { bg: "bg-white", textColor: "text-gray-900", accentColor: "#3B82F6" };

  return (
    <div className="w-full">
          {blocks.map((block) => {
             // Fallback for old blocks without design prop
             const design = { 
               bg: "bg-white", 
               textColor: "text-gray-900", 
               textSize: "base", 
               padding: "py-12", 
               container: "fixed", 
               textAlign: "left" as const,
               accentColor: palette.accentColor,
               ...block.design
             };

             return (
              <div key={block.id} className="landing-block relative">
                  
                  {block.type === 'hero' && <HeroBlock content={block.content} design={design} />}
                  
                  {block.type === 'features' && <FeaturesBlock content={block.content} design={design} />}
                  
                  {block.type === 'button' && <ButtonBlock content={block.content} design={design} />}

                  {block.type === 'timer' && <TimerBlock content={block.content} design={design} />}

                  {block.type === 'reviews' && <ReviewsBlock content={block.content} design={design} />}

                  {block.type === 'pricing' && <PricingBlock content={block.content} design={design} />}

                  {block.type === 'divider' && <DividerBlock content={block.content} design={design} />}

                  {block.type === "text" && (
                    <section className={`${design.bg} ${design.textColor} ${design.padding}`}>
                       <div className={design.container === 'fluid' ? 'w-full px-4' : 'max-w-7xl mx-auto px-4'}>
                           <div 
                             className={`prose max-w-none ${design.textColor === 'text-white' ? 'prose-invert' : ''} ${design.textSize ? `text-${design.textSize}` : ''} text-${design.textAlign}`}
                             dangerouslySetInnerHTML={{ __html: (block.content as any).html }} 
                           />
                           
                           {/* Input Field if enabled */}
                           {(block.content as any).hasInput && (
                              <div className="mt-6 p-4 bg-gray-50 border rounded-xl text-gray-900">
                                 <label className="block text-sm font-medium mb-2 text-gray-700">
                                    {(block.content as any).inputLabel || "Ваш ответ"}
                                 </label>
                                 <textarea 
                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none min-h-[100px] bg-white text-gray-900"
                                    placeholder="Напишите ваш ответ здесь..."
                                    value={answers[block.id] || ""}
                                    onChange={(e) => handleAnswerChange(block.id, e.target.value)}
                                 />
                              </div>
                           )}
                       </div>
                    </section>
                  )}

                  {block.type === "video" && (
                    <section className={`${design.bg} ${design.padding}`}>
                       <div className={design.container === 'fluid' ? 'w-full px-4' : 'max-w-7xl mx-auto px-4'}>
                         <div className="aspect-video bg-black rounded-xl overflow-hidden shadow-lg max-w-4xl mx-auto">
                            <iframe
                               src={`https://customer-2h654e7z77942781.cloudflarestream.com/${(block.content as any).videoId}/iframe`}
                               className="w-full h-full"
                               allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
                               allowFullScreen={true}
                            ></iframe>
                         </div>
                       </div>
                    </section>
                  )}

                  {block.type === "form" && (
                    <section id="form" className={`${design.bg} ${design.padding}`}>
                       <div className={design.container === 'fluid' ? 'w-full px-4' : 'max-w-3xl mx-auto px-4'}>
                          <div className="bg-white border rounded-2xl p-6 md:p-8 shadow-sm">
                             <LandingForm 
                                block={block} 
                                answers={answers} 
                                initialSubmission={initialSubmissions[block.id]}
                             />
                          </div>
                       </div>
                    </section>
                  )}

              </div>
             );
          })}
       </div>
  );
}
