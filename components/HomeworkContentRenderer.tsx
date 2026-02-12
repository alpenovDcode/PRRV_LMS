import React from "react";

interface HomeworkContentRendererProps {
  content: string | any | null;
}

export function HomeworkContentRenderer({ content }: HomeworkContentRendererProps) {
  if (!content) return null;

  try {
    let contentObj: any = content;
    
    // Attempt to parse string to object, handling double-serialization
    // Try up to 3 times to unwrap string -> string -> object
    let attempts = 0;
    while (typeof contentObj === 'string' && attempts < 3) {
       const trimmed = contentObj.trim();
       if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try {
             contentObj = JSON.parse(trimmed);
          } catch (e) {
             // If parse fails, stop trying
             break;
          }
       } else {
          break;
       }
       attempts++;
    }

    if (contentObj && typeof contentObj === 'object' && !Array.isArray(contentObj)) {
      // If _answers is a string, try to parse it too
      if (contentObj._answers && typeof contentObj._answers === 'string') {
         try {
            const answersRaw = contentObj._answers.trim();
            if (answersRaw.startsWith('{')) {
               contentObj._answers = JSON.parse(answersRaw);
            }
         } catch (e) { /* ignore */ }
      }

      return (
        <div className="space-y-4">
          {/* Standard Fields */}
          <div className="space-y-3">
             {Object.entries(contentObj).map(([key, value]) => {
               if (key === '_answers') return null; // Handle separately
               
               // If value is still an object/array (unexpected), stringify it for display
               const displayValue = typeof value === 'object' && value !== null 
                   ? JSON.stringify(value, null, 2) 
                   : String(value);
                   
               return (
                 <div key={key} className="flex flex-col sm:flex-row sm:gap-4 border-b border-gray-200/50 last:border-0 pb-2 last:pb-0">
                   <span className="font-semibold text-gray-500 text-xs uppercase tracking-wider shrink-0 w-32 pt-0.5 break-all">{key}</span>
                   <span className="text-gray-900 text-sm whitespace-pre-wrap flex-1 overflow-hidden break-words">{displayValue}</span>
                 </div>
               );
             })}
          </div>

          {/* Answers from Text Blocks */}
          {contentObj._answers && typeof contentObj._answers === 'object' && Object.keys(contentObj._answers).length > 0 && (
             <div className="pt-4 border-t border-gray-200">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">Ответы на вопросы</h4>
                <div className="space-y-3">
                   {Object.entries(contentObj._answers).map(([key, value], idx) => (
                      <div key={key} className="bg-white p-3 rounded border border-gray-100">
                         <span className="block text-xs text-gray-400 mb-1">Ответ #{idx + 1}</span>
                         <span className="text-gray-900 text-sm whitespace-pre-wrap block break-words">{String(value)}</span>
                      </div>
                   ))}
                </div>
             </div>
          )}
        </div>
      );
    }
  } catch (e) {
    console.error("Format error", e);
  }

  // Fallback for plain text
  return <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{String(content)}</p>;
}
