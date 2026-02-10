"use client";

import { useState, useEffect } from "react";
import { Loader2, AlertTriangle, CheckCircle } from "lucide-react";

export default function LandingForm({ block, answers, initialSubmission }: { block: any, answers?: Record<string, string>, initialSubmission?: any }) {
  const [formData, setFormData] = useState<any>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "waiting" | "completed">("idle");
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [result, setResult] = useState<string>("");
  const [showWarning, setShowWarning] = useState(false);

  // Load saved state from local storage or initialSubmission (cookie)
  useEffect(() => {
     // 1. Try Initial Submission (Server Side / Cookie)
     if (initialSubmission) {
        setSubmissionId(initialSubmission.id);
        if (initialSubmission.status === "approved" || initialSubmission.status === "rejected") {
           setResult(initialSubmission.curatorComment || "");
           setStatus("completed");
           return;
        } else {
           setStatus("waiting");
           // Don't return, let polling start
        }
     }

     // 2. Try Local Storage (Client Side Fallback)
     const stored = localStorage.getItem(`landing_submission_${block.id}`);
     if (stored) {
        const { id, state } = JSON.parse(stored);
        if (state === "waiting") {
           setSubmissionId(id);
           setStatus("waiting");
        }
     }
  }, [block.id, initialSubmission]);

  // Polling Effect
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (status === "waiting" && submissionId) {
      // Poll every 30 seconds
      interval = setInterval(async () => {
        try {
          const res = await fetch("/api/landings/check-status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ submissionId }),
          });
          const data = await res.json();
          
          if (data.status === "completed") {
             setResult(data.comment);
             setStatus("completed");
             localStorage.removeItem(`landing_submission_${block.id}`);
          }
        } catch (e) {
           console.error("Poll error", e);
        }
      }, 30000); 
    }

    // Warn before closing
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
       if (status === "waiting") {
          e.preventDefault();
          e.returnValue = "";
       }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
       clearInterval(interval);
       window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [status, submissionId, block.id]);


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Basic validation if needed, but 'required' attr handles most
    setShowWarning(true);
  };

  const handleConfirmSubmit = async () => {
    setShowWarning(false);
    setStatus("submitting");

    try {
      const res = await fetch("/api/landings/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
           blockId: block.id,
           data: formData,
           answers: answers || {} 
        }),
      });
      const data = await res.json();

      if (res.ok) {
         setSubmissionId(data.submissionId);
         setStatus("waiting");
         // Save to LS
         localStorage.setItem(`landing_submission_${block.id}`, JSON.stringify({ 
            id: data.submissionId, 
            state: "waiting" 
         }));
      } else {
         alert("Ошибка: " + data.error);
         setStatus("idle");
      }
    } catch (e) {
      alert("Ошибка сети");
      setStatus("idle");
    }
  };

  if (status === "completed") {
     return (
        <div className="p-8 bg-green-50 border border-green-200 rounded-xl text-center shadow-sm">
           <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
           <h3 className="text-xl font-bold text-green-800 mb-2">Ответ получен!</h3>
           <p className="text-gray-700 whitespace-pre-wrap">{result}</p>
        </div>
     );
  }

  if (status === "waiting") {
      return (
         <div className="p-8 bg-blue-50 border border-blue-100 rounded-xl text-center shadow-sm">
            <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
            <h3 className="text-xl font-bold text-blue-800 mb-2">Отправлено!</h3>
            <p className="text-blue-600 mb-4">
               Ваш ответ принят в обработку. <br/>
               Результат проверки придет вам на <b>Email</b> в течение часа.
            </p>
            <p className="text-sm text-gray-500 mb-6">
               Вы можете подождать результат здесь (страница обновляется автоматически) или закрыть вкладку.
            </p>
            
            <button 
                onClick={() => {
                   setStatus("idle");
                   setSubmissionId(null);
                }}
                className="text-blue-400 hover:text-blue-600 text-sm underline"
            >
               Вернуться к форме
            </button>
         </div>
      );
  }

  const { fields, buttonText } = block.content;

  return (
    <>
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto">
      {fields.map((field: any, i: number) => (
         <div key={i}>
            <label className="block text-sm font-medium text-gray-900 mb-1">
               {field.label} {field.required && <span className="text-red-500">*</span>}
            </label>
            <input
               type={field.type}
               required={field.required}
               className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-black bg-white placeholder-gray-400 transition-all"
               placeholder={field.type === "tel" ? "+7 (___) ___-__-__" : ""}
               onChange={(e) => setFormData({ ...formData, [field.label]: e.target.value })} 
            />
         </div>
      ))}

      <button
         disabled={status === "submitting"}
         type="submit"
         className="w-full py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition disabled:opacity-50 shadow-md hover:shadow-lg"
      >
         {status === "submitting" ? (
            <span className="flex items-center justify-center gap-2">
               <Loader2 className="w-5 h-5 animate-spin" />
               Отправка...
            </span>
         ) : (
            buttonText || "Отправить"
         )}
      </button>
    </form>
    
      {/* Modal Confirmation */}
      {showWarning && (
         <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white p-6 rounded-xl max-w-sm text-center shadow-2xl">
               <h3 className="text-lg font-bold mb-2">Подтверждение</h3>
               <p className="text-gray-600 mb-6 text-sm">
                  Отправить данные на проверку? <br/>
                  Результат придет на указанный Email.
               </p>
               <div className="flex gap-2 justify-center">
                  <button 
                     onClick={() => setShowWarning(false)}
                     className="px-4 py-2 border rounded-lg hover:bg-gray-50 text-sm"
                  >
                     Отмена
                  </button>
                  <button 
                     onClick={handleConfirmSubmit}
                     className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                  >
                     Отправить
                  </button>
               </div>
            </div>
         </div>
      )}
    </>
  );
}
