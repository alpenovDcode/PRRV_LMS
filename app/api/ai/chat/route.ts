import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import {
  createEmbedding,
  streamLLMResponse,
  cosineSimilarity,
  replicate,
  LLM_MODEL,
  type KBChunk,
  type ScoredChunk,
} from "@/lib/ai/replicate";

// --- In-Memory KB Cache (Lazy Loading — reads file only once) ---
let kbCache: KBChunk[] | null = null;

async function getKnowledgeBase(): Promise<KBChunk[]> {
  if (kbCache) return kbCache;

  console.log("[AI] Loading knowledge base into memory (first request)...");
  const kbPath = path.join(process.cwd(), "data/knowledge_base.json");
  const raw = await fs.readFile(kbPath, "utf-8");
  kbCache = JSON.parse(raw) as KBChunk[];
  console.log(`[AI] Loaded ${kbCache.length} chunks into memory.`);
  return kbCache;
}

// --- System Prompt (strict RAG) ---
const SYSTEM_PROMPT = `Ты — ИИ-ассистент платформы «Прорыв» (LMS).

ПРАВИЛА:
1. Отвечай ТОЛЬКО на основе предоставленного ниже контекста из базы знаний.
2. Если информации нет в контексте — честно скажи: «К сожалению, в базе знаний нет информации по этому вопросу.»
3. НЕ выдумывай факты, цифры и инструкции, которых нет в контексте.
4. Отвечай на русском языке.
5. Форматируй ответ в чистом Markdown (списки, заголовки, жирный текст).
6. Будь дружелюбным и профессиональным.`;

// --- POST Handler ---
export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();
    const lastMessage: string = messages[messages.length - 1].content;

    // --- Step 1: Query Refinement (Smart RAG) ---
    // Expand the user's query into a better search query using the LLM
    let searchContext = lastMessage; // Changed from lastUserMessage to lastMessage for consistency with original code

    try {
      const refinementPrompt = `
        Ты — эксперт по поиску информации. Твоя задача — превратить вопрос пользователя в идеальный поисковый запрос для базы знаний.
        Используй контекст предыдущих сообщений, если это необходимо.

        История диалога:
        ${messages.slice(-3, -1).map((m: { role: string; content: string }) => `${m.role}: ${m.content}`).join("\n")}

        Вопрос пользователя: ${lastMessage}

        Выдай ТОЛЬКО уточненный поисковый запрос на русском языке, без лишних слов.
      `;

      const refinedOutput: any = await replicate.run(LLM_MODEL, {
        input: { prompt: refinementPrompt, max_new_tokens: 100, temperature: 0.1 }
      });

      if (refinedOutput) {
        // Handle both string and array outputs from Replicate
        searchContext = Array.isArray(refinedOutput) ? refinedOutput.join("") : refinedOutput;
        console.log("Refined Query:", searchContext);
      }
    } catch (err) {
      console.error("Query refinement failed, falling back to original query:", err);
    }

    // --- Step 2: Vector Search ---
    // 1. Generate query embedding
    const userEmbedding = await createEmbedding(searchContext.trim());
    const queryVector = userEmbedding[0]; // Corrected to use userEmbedding

    // 2. Load KB from cache
    const kbData = await getKnowledgeBase();

    // 3. Find top-5 relevant chunks
    const scoredChunks: ScoredChunk[] = kbData
      .filter((chunk) => chunk.embedding && Array.isArray(chunk.embedding))
      .map((chunk) => ({
        ...chunk,
        score: cosineSimilarity(queryVector, chunk.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    // 4. Build context string
    const context = scoredChunks
      .map((c) => `[Источник: ${c.source}, Раздел: ${c.metadata.title}]\n${c.content}`)
      .join("\n\n---\n\n");

    // 5. Build full prompt
    const conversationHistory = messages
      .map((m: { role: string; content: string }) =>
        `${m.role === "user" ? "user" : "assistant"}: ${m.content}`
      )
      .join("\n");

    const fullPrompt = `system: ${SYSTEM_PROMPT}\n\nКонтекст базы знаний:\n${context}\n\n${conversationHistory}\nassistant:`;

    // 6. Stream LLM response
    const replicateStream = streamLLMResponse(fullPrompt);

    // 7. Create a ReadableStream with TextEncoder for useChat compatibility
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of replicateStream) {
            controller.enqueue(encoder.encode(event.toString()));
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[AI] Chat error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
