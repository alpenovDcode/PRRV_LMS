"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
      <AnimatePresence>
          {blocks.map((block, idx) => {
             // Fallback for old blocks without design prop
             const design = { 
               bg: "bg-white", 
               textColor: "text-gray-900", 
               textSize: "lg", 
               padding: "py-24", 
               container: "fixed", 
               textAlign: "left" as const,
               accentColor: palette.accentColor,
               ...block.design
             };

             return (
              <motion.div 
                key={block.id} 
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-10%" }}
                transition={{ duration: 0.8, delay: idx * 0.05, ease: "easeOut" }}
                className="landing-block relative"
              >
                  
                  {block.type === 'hero' && <HeroBlock content={block.content} design={design} />}
                  
                  {block.type === 'features' && <FeaturesBlock content={block.content} design={design} />}
                  
                  {block.type === 'button' && <ButtonBlock content={block.content} design={design} />}

                  {block.type === 'timer' && <TimerBlock content={block.content} design={design} />}

                  {block.type === 'reviews' && <ReviewsBlock content={block.content} design={design} />}

                  {block.type === 'pricing' && <PricingBlock content={block.content} design={design} />}

                  {block.type === 'divider' && <DividerBlock content={block.content} design={design} />}

                  {block.type === "text" && (
                    <section className={`${design.bg} ${design.textColor} ${design.padding}`}>
                       <div className={design.container === 'fluid' ? 'w-full px-6 md:px-12' : 'max-w-7xl mx-auto px-6 md:px-12'}>
                           <div 
                             className={`prose prose-xl md:prose-2xl max-w-none ${design.textColor === 'text-white' ? 'prose-invert' : ''} text-${design.textAlign} heading-premium tracking-tight leading-snug`}
                             dangerouslySetInnerHTML={{ __html: (block.content as any).html }} 
                           />
                           
                           {/* Input Field if enabled */}
                           {(block.content as any).hasInput && (
                              <div className="mt-12 p-10 bg-gray-50/50 backdrop-blur-md border border-gray-100 rounded-[2.5rem] shadow-bento">
                                 <label className="block text-sm font-black uppercase tracking-widest mb-4 text-gray-400">
                                    {(block.content as any).inputLabel || "Ваш ответ"}
                                 </label>
                                 <textarea 
                                    className="w-full p-6 border border-gray-100 rounded-3xl focus:ring-4 focus:ring-blue-500/10 outline-none min-h-[150px] bg-white text-gray-900 text-lg font-medium shadow-inner transition-all"
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
                       <div className={design.container === 'fluid' ? 'w-full px-6 md:px-12' : 'max-w-7xl mx-auto px-6 md:px-12'}>
                         <div className="aspect-video bg-black rounded-[3rem] overflow-hidden shadow-2xl max-w-5xl mx-auto ring-8 ring-white/5">
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
                       <div className={design.container === 'fluid' ? 'w-full px-6 md:px-12' : 'max-w-4xl mx-auto px-6 md:px-12'}>
                          <div className="bg-white border border-gray-100 rounded-[3rem] p-8 md:p-16 shadow-premium relative overflow-hidden">
                             <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500" />
                             <LandingForm 
                                block={block} 
                                answers={answers} 
                                initialSubmission={initialSubmissions[block.id]}
                             />
                          </div>
                       </div>
                    </section>
                  )}

              </motion.div>
             );
          })}
      </AnimatePresence>
       </div>
  );
}
