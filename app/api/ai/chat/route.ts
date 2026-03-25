import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthenticatedRequest } from "@/lib/api-middleware";
import { ApiResponse } from "@/types";

// --- System Instructions (from User Manual) ---
const SYSTEM_INSTRUCTIONS = "Ты Куратор курса Прорыв. Отвечай только по базе знаний #Прорыв_продукт. Будь вежлив.";

/**
 * POST /api/ai/chat
 * Интеграция с OpenClaw API (Этап 7)
 * Заменяет ручной пайплайн RAG на вызов локального агента.
 */
export async function POST(req: NextRequest) {
  return withAuth(
    req,
    async (authenticatedReq: AuthenticatedRequest) => {
      try {
        const { messages } = await authenticatedReq.json();
        const lastMessage: string = messages[messages.length - 1].content;
        const userId = authenticatedReq.user?.userId || "anonymous";

        const openClawUrl = process.env.OPENCLAW_API_URL || "http://127.0.0.1:18789/v1/responses";
        const openClawKey = process.env.OPENCLAW_API_KEY;
        const agentId = process.env.OPENCLAW_AGENT_ID || "main";

        if (!openClawKey) {
          throw new Error("OPENCLAW_API_KEY is not configured");
        }

        console.log(`[AI] Forwarding request to OpenClaw for user: ${userId}`);

        const response = await fetch(openClawUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${openClawKey}`,
            "x-openclaw-agent-id": agentId,
          },
          body: JSON.stringify({
            model: "openclaw",
            input: lastMessage,
            user: userId, // Передаем ID пользователя для памяти сессии
            instructions: SYSTEM_INSTRUCTIONS,
            stream: true, // Включаем серверный стриминг
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(`OpenClaw API Error (${response.status}): ${JSON.stringify(errorData)}`);
        }

        // Возвращаем сырой поток (Stream) прямо на фронтенд (Vercel AI SDK сам его распарсит)
        console.log(`[AI] OpenClaw response OK, starting stream...`);
        return new Response(response.body, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
          },
        });

      } catch (error: any) {
        console.error("[AI] Chat error (OpenClaw):", error);
        return NextResponse.json<ApiResponse>(
          { 
            success: false, 
            error: { 
              code: "AI_ERROR", 
              message: `Ошибка: ${error.message || "Неизвестная ошибка ИИ"}` 
            } 
          }, 
          { status: 500 }
        );
      }
    }
  );
}
