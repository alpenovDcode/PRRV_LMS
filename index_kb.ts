import fs from 'fs/promises';
import path from 'path';
import Replicate from 'replicate';
import { v4 as uuidv4 } from 'uuid';

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const EMBEDDING_MODEL = "bge-m3";

async function createEmbedding(text: string | string[]) {
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

async function run() {
  try {
    const kbDir = path.join(process.cwd(), "content/kb");
    const files = await fs.readdir(kbDir);
    const mdFiles = files.filter(f => f.endsWith(".md"));

    const allChunks: any[] = [];

    for (const file of mdFiles) {
      const filePath = path.join(kbDir, file);
      const content = await fs.readFile(filePath, "utf-8");
      
      const sections = content.split(/## # Урок/).filter(s => s.trim().length > 0);
      
      sections.forEach((section, sIndex) => {
        const lines = section.split("\n").filter(l => l.trim().length > 0);
        const title = lines[0]?.trim().replace(/\*\*/g, "") || "Без названия";
        
        // Split section if too long with overlap for better context
        const maxChunkLen = 600;
        const overlap = 150;
        
        if (section.length > maxChunkLen) {
          let currentPos = 0;
          let chunkIndex = 0;
          while (currentPos < section.length) {
            let endPos = currentPos + maxChunkLen;
            
            // Try to find a good split point (newline or period) within the last 20% of the chunk
            if (endPos < section.length) {
              const searchRange = Math.floor(maxChunkLen * 0.2);
              const lastNewline = section.lastIndexOf("\n", endPos);
              const lastPeriod = section.lastIndexOf(". ", endPos);
              
              if (lastNewline > endPos - searchRange) {
                endPos = lastNewline + 1;
              } else if (lastPeriod > endPos - searchRange) {
                endPos = lastPeriod + 2;
              }
            }
            
            const chunkContent = section.substring(currentPos, endPos).trim();
            if (chunkContent.length > 50) { // Avoid tiny chunks
              allChunks.push({
                id: uuidv4(),
                content: "## Урок " + chunkContent,
                source: file,
                metadata: {
                  index: sIndex,
                  subIndex: chunkIndex,
                  title: `${title} (Часть ${chunkIndex + 1})`
                }
              });
              chunkIndex++;
            }
            
            if (endPos >= section.length) break;
            currentPos = endPos - overlap;
          }
        } else {
          allChunks.push({
            id: uuidv4(),
            content: "## Урок " + section.trim(),
            source: file,
            metadata: {
              index: sIndex,
              title
            }
          });
        }
      });
    }

    console.log(`Found ${allChunks.length} chunks. Generating embeddings...`);

    const batchSize = 25; 
    const finalData: any[] = [];
    const kbPath = path.join(process.cwd(), "data/knowledge_base.json");
    await fs.mkdir(path.join(process.cwd(), "data"), { recursive: true });

    for (let i = 0; i < allChunks.length; i += batchSize) {
      const batch = allChunks.slice(i, i + batchSize);
      const texts = batch.map(c => c.content);
      
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1} (${batch.length} chunks)...`);
      
      try {
        const embeddings = await createEmbedding(texts);
        
        batch.forEach((chunk, index) => {
          // Round embeddings to 4 decimal places to save space in JSON
          const compactEmbedding = embeddings[index].map(n => Math.round(n * 10000) / 10000);
          finalData.push({
            ...chunk,
            embedding: compactEmbedding
          });
        });
        
        // Save incrementally
        await fs.writeFile(kbPath, JSON.stringify(finalData, null, 2));
        console.log(`Successfully saved ${finalData.length} chunks.`);
      } catch (err: any) {
        console.error(`Error in batch ${Math.floor(i / batchSize) + 1}:`, err.message);
        // Retry logic or continue
        i -= batchSize; // Simple retry
        console.log("Retrying in 5 seconds...");
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    console.log("Indexing complete!");
  } catch (err) {
    console.error(err);
  }
}

run();
