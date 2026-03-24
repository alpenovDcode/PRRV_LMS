import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const uuidv4 = () => crypto.randomUUID();
const EMBEDDING_MODEL = "bge-m3";

async function createEmbedding(text: string | string[]) {
  const texts = Array.isArray(text) ? text : [text];
  const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
  
  const response = await fetch(`${ollamaUrl}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
  });

  if (!response.ok) throw new Error(`Ollama API error: ${response.statusText}`);
  const data = await response.json();
  return data.embeddings as number[][];
}

// --- Parent-Child Chunking ---
interface RawChunk {
  id: string;
  parentId: string | null;
  type: 'parent' | 'child' | 'standalone';
  parentContent?: string; // full parent text, stored in child for fast retrieval
  content: string;
  source: string;
  metadata: { index: number; subIndex?: number; title: string };
}

const PARENT_MAX_LEN = 2000;  // родительский чанк — до 2000 символов
const CHILD_MAX_LEN  = 400;   // дочерний чанк — до 400 символов
const CHILD_OVERLAP  = 80;    // перекрытие между дочерними чанками

function splitIntoChunks(text: string, maxLen: number, overlap: number): string[] {
  const chunks: string[] = [];
  let pos = 0;
  while (pos < text.length) {
    let end = pos + maxLen;
    if (end < text.length) {
      // Ищем хорошее место для разреза (конец абзаца или предложения)
      const searchRange = Math.floor(maxLen * 0.25);
      const lastNewline = text.lastIndexOf('\n', end);
      const lastPeriod  = text.lastIndexOf('. ', end);
      if (lastNewline > end - searchRange) end = lastNewline + 1;
      else if (lastPeriod > end - searchRange) end = lastPeriod + 2;
    }
    const chunk = text.substring(pos, end).trim();
    if (chunk.length > 40) chunks.push(chunk);
    if (end >= text.length) break;
    pos = end - overlap;
  }
  return chunks;
}

async function run() {
  try {
    const kbDir  = path.join(process.cwd(), "content/kb");
    const kbPath = path.join(process.cwd(), "data/knowledge_base.json");
    await fs.mkdir(path.join(process.cwd(), "data"), { recursive: true });

    const files   = await fs.readdir(kbDir);
    const mdFiles = files.filter(f => f.endsWith(".md"));

    const rawChunks: RawChunk[] = [];

    for (const file of mdFiles) {
      const filePath = path.join(kbDir, file);
      const content  = await fs.readFile(filePath, "utf-8");

      // Делим на секции по заголовку урока
      const sections = content.split(/## # Урок/).filter(s => s.trim().length > 0);

      sections.forEach((section, sIndex) => {
        const lines = section.split("\n").filter(l => l.trim().length > 0);
        const title = lines[0]?.trim().replace(/\*\*/g, "") || "Без названия";
        const fullText = "## Урок " + section.trim();

        if (fullText.length <= CHILD_MAX_LEN) {
          // Короткая секция — одиночный чанк (standalone)
          rawChunks.push({
            id: uuidv4(), parentId: null, type: 'standalone',
            content: fullText, source: file,
            metadata: { index: sIndex, title },
          });
          return;
        }

        // Разбиваем секцию на родительские блоки
        const parentTexts = splitIntoChunks(fullText, PARENT_MAX_LEN, 0);

        parentTexts.forEach((parentText, pIndex) => {
          const parentId = uuidv4();

          if (parentText.length <= CHILD_MAX_LEN) {
            // Родительский блок достаточно короткий — один child = parent
            rawChunks.push({
              id: uuidv4(), parentId, type: 'child',
              parentContent: parentText,
              content: parentText, source: file,
              metadata: { index: sIndex, subIndex: pIndex, title: `${title} (Блок ${pIndex + 1})` },
            });
            return;
          }

          // Нарезаем родительский блок на дочерние чанки
          const childTexts = splitIntoChunks(parentText, CHILD_MAX_LEN, CHILD_OVERLAP);
          childTexts.forEach((childText, cIndex) => {
            rawChunks.push({
              id: uuidv4(), parentId, type: 'child',
              parentContent: parentText,   // весь родительский блок — для промпта LLM
              content: childText,          // маленький кусок — для векторного поиска
              source: file,
              metadata: {
                index: sIndex,
                subIndex: pIndex * 100 + cIndex,
                title: `${title} (Блок ${pIndex + 1}, Ч. ${cIndex + 1})`,
              },
            });
          });
        });
      });
    }

    console.log(`Found ${rawChunks.length} chunks (Parent-Child). Generating embeddings...`);

    const batchSize = 25;
    const finalData: any[] = [];

    for (let i = 0; i < rawChunks.length; i += batchSize) {
      const batch = rawChunks.slice(i, i + batchSize);
      const texts = batch.map(c => c.content); // embeddings только для content (child)
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1} (${batch.length} chunks)...`);

      let retries = 0;
      while (retries < 3) {
        try {
          const embeddings = await createEmbedding(texts);
          batch.forEach((chunk, index) => {
            const compactEmbedding = embeddings[index].map(n => Math.round(n * 10000) / 10000);
            finalData.push({ ...chunk, embedding: compactEmbedding });
          });
          await fs.writeFile(kbPath, JSON.stringify(finalData, null, 2));
          console.log(`Successfully saved ${finalData.length} chunks.`);
          break;
        } catch (err: any) {
          retries++;
          console.error(`Error in batch ${Math.floor(i / batchSize) + 1} (attempt ${retries}):`, err.message);
          if (retries < 3) {
            console.log("Retrying in 5 seconds...");
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
      }
    }

    console.log("Indexing complete!");
  } catch (err) {
    console.error(err);
  }
}

run();
