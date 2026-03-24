/**
 * lib/ai/search.ts
 *
 * Hybrid RAG Search module:
 * 1. BM25 (Sparse Retrieval)
 * 2. Vector Search (Dense Retrieval) — вызывается снаружи
 * 3. RRF (Reciprocal Rank Fusion) — объединение выдачи
 * 4. Reranker — через Ollama bge-reranker-v2-m3
 */

import type { KBChunk, ScoredChunk } from "@/lib/ai/replicate";

// ─────────────────────────────────────────────
// BM25
// ─────────────────────────────────────────────

interface BM25Index {
  idf: Record<string, number>;
  tf: Record<string, Record<string, number>>; // docId → term → tf
  avgDocLen: number;
  docLengths: Record<string, number>;
  docIds: string[];
}

let bm25Index: BM25Index | null = null;
let bm25Corpus: KBChunk[] | null = null;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\wа-яёа-я\s]/gi, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function buildBM25Index(chunks: KBChunk[]): void {
  if (bm25Corpus === chunks) return; // уже построен для этого корпуса

  const N = chunks.length;
  const tf: Record<string, Record<string, number>> = {};
  const df: Record<string, number> = {};
  const docLengths: Record<string, number> = {};
  let totalLen = 0;

  for (const chunk of chunks) {
    const tokens = tokenize(chunk.content);
    docLengths[chunk.id] = tokens.length;
    totalLen += tokens.length;
    tf[chunk.id] = {};

    const seen = new Set<string>();
    for (const token of tokens) {
      tf[chunk.id][token] = (tf[chunk.id][token] || 0) + 1;
      if (!seen.has(token)) { df[token] = (df[token] || 0) + 1; seen.add(token); }
    }
  }

  const idf: Record<string, number> = {};
  for (const [term, freq] of Object.entries(df)) {
    idf[term] = Math.log((N - freq + 0.5) / (freq + 0.5) + 1);
  }

  bm25Index = {
    idf, tf,
    avgDocLen: totalLen / N,
    docLengths,
    docIds: chunks.map(c => c.id),
  };
  bm25Corpus = chunks;
}

const BM25_K = 1.5;
const BM25_B = 0.75;

export function bm25Search(query: string, chunks: KBChunk[], topK: number): ScoredChunk[] {
  if (!bm25Index || bm25Corpus !== chunks) buildBM25Index(chunks);
  const idx = bm25Index!;
  const queryTokens = tokenize(query);

  const chunkMap = new Map<string, KBChunk>(chunks.map(c => [c.id, c]));

  const scores: { id: string; score: number }[] = idx.docIds.map(docId => {
    let score = 0;
    const docLen = idx.docLengths[docId] || 0;
    const norm = 1 - BM25_B + BM25_B * (docLen / idx.avgDocLen);

    for (const term of queryTokens) {
      const tfVal = idx.tf[docId]?.[term] || 0;
      if (tfVal === 0) continue;
      const idfVal = idx.idf[term] || 0;
      score += idfVal * ((tfVal * (BM25_K + 1)) / (tfVal + BM25_K * norm));
    }
    return { id: docId, score };
  });

  return scores
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ id, score }) => ({ ...chunkMap.get(id)!, score }));
}

// ─────────────────────────────────────────────
// RRF (Reciprocal Rank Fusion)
// ─────────────────────────────────────────────

const RRF_K = 60;

export function rrfFusion(
  listA: ScoredChunk[],
  listB: ScoredChunk[],
  topK: number
): ScoredChunk[] {
  const scores = new Map<string, { chunk: ScoredChunk; rrf: number }>();

  const addList = (list: ScoredChunk[]) => {
    list.forEach((chunk, rank) => {
      const rrfScore = 1 / (RRF_K + rank + 1);
      const existing = scores.get(chunk.id);
      if (existing) {
        existing.rrf += rrfScore;
      } else {
        scores.set(chunk.id, { chunk, rrf: rrfScore });
      }
    });
  };

  addList(listA);
  addList(listB);

  return Array.from(scores.values())
    .sort((a, b) => b.rrf - a.rrf)
    .slice(0, topK)
    .map(({ chunk, rrf }) => ({ ...chunk, score: rrf }));
}

// ─────────────────────────────────────────────
// Reranker (Ollama bge-reranker-v2-m3)
// ─────────────────────────────────────────────

export async function rerankChunks(
  query: string,
  candidates: ScoredChunk[],
  topK: number
): Promise<ScoredChunk[]> {
  try {
    const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";

    const response = await fetch(`${ollamaUrl}/api/rerank`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "bge-reranker-v2-m3",
        query,
        documents: candidates.map(c => c.content),
        top_n: topK,
      }),
      // Таймаут 5 секунд — если Reranker медленный, тогда fallback
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) throw new Error(`Reranker error: ${response.statusText}`);

    const data = await response.json();

    // Ollama rerank format: { results: [{ index, relevance_score }, ...] }
    const results: { index: number; relevance_score: number }[] = data.results;
    return results.map(r => ({
      ...candidates[r.index],
      score: r.relevance_score,
    }));
  } catch (err) {
    console.warn("[Reranker] Skipped (fallback to RRF):", (err as Error).message);
    // Если Reranker недоступен — возвращаем топ по RRF без изменений
    return candidates.slice(0, topK);
  }
}
