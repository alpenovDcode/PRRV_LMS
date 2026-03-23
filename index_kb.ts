import fs from 'fs/promises';
import path from 'path';
import Replicate from 'replicate';
import { v4 as uuidv4 } from 'uuid';

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const EMBEDDING_MODEL = "ibm-granite/granite-embedding-278m-multilingual";

async function createEmbedding(text: string | string[]) {
  const texts = Array.isArray(text) ? text : [text];
  const output: any = await replicate.run(EMBEDDING_MODEL, {
    input: { texts },
  });
  return output as number[][];
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
        
        // Split section if too long
        const maxChunkLen = 500;
        if (section.length > maxChunkLen) {
          let currentPos = 0;
          let chunkIndex = 0;
          while (currentPos < section.length) {
            let nextPos = currentPos + maxChunkLen;
            if (nextPos < section.length) {
              // Try to find a good split point (newline or space)
              const lastNewline = section.lastIndexOf("\n", nextPos);
              if (lastNewline > currentPos + maxChunkLen / 2) {
                nextPos = lastNewline;
              }
            }
            
            const chunkContent = section.substring(currentPos, nextPos).trim();
            if (chunkContent.length > 0) {
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
            currentPos = nextPos;
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

    const batchSize = 1; 
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
          finalData.push({
            ...chunk,
            embedding: embeddings[index]
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
