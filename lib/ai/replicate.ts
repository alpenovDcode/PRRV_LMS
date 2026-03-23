import Replicate from "replicate";

// --- Replicate Client ---
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// --- Model Configuration ---
export const EMBEDDING_MODEL = "bge-m3";
export const LLM_MODEL = "google/gemini-3-flash";

// --- Types ---
export interface KBChunk {
  id: string;
  content: string;
  source: string;
  metadata: {
    index: number;
    subIndex?: number;
    title: string;
  };
  embedding: number[];
}

export interface ScoredChunk extends KBChunk {
  score: number;
}

// --- Vector Search Utility (isolated for future Vector DB migration) ---
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const magA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const magB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
  if (magA === 0 || magB === 0) return 0;
  return dotProduct / (magA * magB);
}

// --- Embedding ---
export async function createEmbedding(text: string | string[]): Promise<number[][]> {
  const texts = Array.isArray(text) ? text : [text];
  const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
  
  const response = await fetch(`${ollamaUrl}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.embeddings as number[][];
}

// --- LLM Streaming ---
export function streamLLMResponse(prompt: string) {
  return replicate.stream(LLM_MODEL, {
    input: {
      prompt,
      max_new_tokens: 1024,
      temperature: 0.7,
    },
  });
}

export { replicate };
