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
import { bm25Search, buildBM25Index, rrfFusion, rerankChunks } from "@/lib/ai/search";

// --- In-Memory KB Cache ---
let kbCache: KBChunk[] | null = null;

async function getKnowledgeBase(): Promise<KBChunk[]> {
  if (kbCache) return kbCache;
  console.log("[AI] Loading knowledge base into memory (first request)...");
  const kbPath = path.join(process.cwd(), "data/knowledge_base.json");
  const raw = await fs.readFile(kbPath, "utf-8");
  kbCache = JSON.parse(raw) as KBChunk[];
  console.log(`[AI] Loaded ${kbCache.length} chunks. Building BM25 index...`);
  buildBM25Index(kbCache); // Строим BM25-индекс при первой загрузке
  console.log("[AI] BM25 index built.");
  return kbCache;
}

// --- System Prompt (hardened) ---
const SYSTEM_PROMPT = `Ты — ИИ-ассистент учебной платформы «Прорыв».

СТРОГИЕ ПРАВИЛА:
1. Отвечай ТОЛЬКО на основе предоставленного ниже контекста.
2. Если ответа нет в контексте — честно скажи: «Я не нашел информации об этом в базе знаний курса. Попробуй задать вопрос по-другому или обратись к куратору.»
3. НЕ выдумывай факты, цифры, примеры и инструкции, которых нет в контексте.
4. При цитировании источника указывай его: «Как сказано в [Название урока]...»
5. Отвечай на русском языке.
6. Форматируй ответ в чистом Markdown (списки, заголовки, жирный текст).
7. Будь дружелюбным и профессиональным.`;

// --- POST Handler ---
export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();
    const lastMessage: string = messages[messages.length - 1].content;

    // ─── Step 1: Query Refinement ───
    let searchQuery = lastMessage;
    try {
      const refinementPrompt = `
Ты — эксперт по поиску информации. Твоя задача — превратить вопрос пользователя в идеальный поисковый запрос.
Используй контекст предыдущих сообщений, если необходимо.

История диалога:
${messages.slice(-3, -1).map((m: { role: string; content: string }) => `${m.role}: ${m.content}`).join("\n")}

Вопрос пользователя: ${lastMessage}

Выдай ТОЛЬКО уточненный поисковый запрос на русском языке, без лишних слов.
      `;
      const refinedOutput: any = await replicate.run(LLM_MODEL, {
        input: { prompt: refinementPrompt, max_new_tokens: 100, temperature: 0.1 }
      });
      if (refinedOutput) {
        searchQuery = Array.isArray(refinedOutput) ? refinedOutput.join("") : refinedOutput;
        console.log("[AI] Refined Query:", searchQuery.trim());
      }
    } catch (err) {
      console.error("[AI] Query refinement failed, using original query:", err);
    }

    // ─── Step 2: Load KB ───
    const kbData = await getKnowledgeBase();

    // ─── Step 3: Vector Search (Dense) — Top-15 ───
    const queryEmbedding = await createEmbedding(searchQuery.trim());
    const queryVector = queryEmbedding[0];

    const vectorResults: ScoredChunk[] = kbData
      .filter(c => c.embedding && Array.isArray(c.embedding))
      .map(c => ({ ...c, score: cosineSimilarity(queryVector, c.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 15);

    // ─── Step 4: BM25 Search (Sparse) — Top-15 ───
    const bm25Results = bm25Search(searchQuery.trim(), kbData, 15);

    // ─── Step 5: RRF Fusion → Top-15 merged ───
    const fusedResults = rrfFusion(vectorResults, bm25Results, 15);

    // ─── Step 6: Reranking → Top-5 ───
    const topChunks = await rerankChunks(searchQuery.trim(), fusedResults, 5);

    // ─── Step 7: Build context (Parent-Child: use parentContent for LLM) ───
    const seen = new Set<string>();
    const context = topChunks
      .map(c => {
        // Берём parentContent если есть (полный урок), иначе content
        const text = c.parentContent || c.content;
        // Дедупликация: если этот parentContent уже использован — пропускаем
        const key = c.parentId || c.id;
        if (seen.has(key)) return null;
        seen.add(key);
        return `[Источник: ${c.source}, Раздел: ${c.metadata.title}]\n${text}`;
      })
      .filter(Boolean)
      .join("\n\n---\n\n");

    // ─── Step 8: Build full prompt ───
    const conversationHistory = messages
      .map((m: { role: string; content: string }) =>
        `${m.role === "user" ? "user" : "assistant"}: ${m.content}`
      )
      .join("\n");

    const fullPrompt = `system: ${SYSTEM_PROMPT}\n\nКонтекст базы знаний:\n${context}\n\n${conversationHistory}\nassistant:`;

    // ─── Step 9: Stream LLM response ───
    const replicateStream = streamLLMResponse(fullPrompt);
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
