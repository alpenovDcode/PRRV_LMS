"use client";

import { useState } from "react";
import LandingForm from "./LandingForm";

interface WrapperProps {
  blocks: any[]; 
  initialSubmissions?: Record<string, any>;
}

export default function LandingPageClient({ blocks, initialSubmissions = {} }: WrapperProps) {
  // Global state for answers from Text Blocks
  // Key: blockId, Value: text answer
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const handleAnswerChange = (blockId: string, text: string) => {
    setAnswers(prev => ({ ...prev, [blockId]: text }));
  };

  return (
    <div className="max-w-3xl mx-auto py-12 px-4 space-y-12">
          {blocks.map((block) => (
             <div key={block.id} className="landing-block">
                
                {block.type === "text" && (
                   <div>
                       <div 
                         className="prose prose-lg max-w-none"
                         dangerouslySetInnerHTML={{ __html: (block.content as any).html }} 
                       />
                       
                       {/* Input Field if enabled */}
                       {(block.content as any).hasInput && (
                          <div className="mt-6 p-4 bg-gray-50 border rounded-xl">
                             <label className="block text-sm font-medium mb-2 text-gray-700">
                                {(block.content as any).inputLabel || "Ваш ответ"}
                             </label>
                             <textarea 
                                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none min-h-[100px]"
                                placeholder="Напишите ваш ответ здесь..."
                                value={answers[block.id] || ""}
                                onChange={(e) => handleAnswerChange(block.id, e.target.value)}
                             />
                          </div>
                       )}
                   </div>
                )}

                {block.type === "video" && (
                   <div className="aspect-video bg-black rounded-xl overflow-hidden shadow-lg">
                      <iframe
                         src={`https://customer-2h654e7z77942781.cloudflarestream.com/${(block.content as any).videoId}/iframe`}
                         className="w-full h-full"
                         allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
                         allowFullScreen={true}
                      ></iframe>
                   </div>
                )}

                {block.type === "form" && (
                   <div className="bg-gray-50 border rounded-2xl p-6 md:p-8">
                      {/* Pass global answers to the form submission logic */}
                      <LandingForm 
                        block={block} 
                        answers={answers} 
                        initialSubmission={initialSubmissions[block.id]}
                      />
                   </div>
                )}

             </div>
          ))}
       </div>
  );
}
