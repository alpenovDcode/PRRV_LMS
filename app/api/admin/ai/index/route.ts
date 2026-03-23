import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { createEmbedding } from "@/lib/ai/replicate";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: NextRequest) {
  try {
    const kbDir = path.join(process.cwd(), "content/kb");
    const files = await fs.readdir(kbDir);
    const mdFiles = files.filter(f => f.endsWith(".md"));

    const allChunks: { id: string; content: string; source: string; metadata: any }[] = [];

    for (const file of mdFiles) {
      const filePath = path.join(kbDir, file);
      const content = await fs.readFile(filePath, "utf-8");
      
      const sections = content.split(/## # Урок/).filter(s => s.trim().length > 0);
      
      sections.forEach((section, sIndex) => {
        const lines = section.split("\n").filter(l => l.trim().length > 0);
        const title = lines[0]?.trim().replace(/\*\*/g, "") || "Без названия";
        
        // Split section if too long (max 500 chars for Granite)
        const maxChunkLen = 500;
        if (section.length > maxChunkLen) {
          let currentPos = 0;
          let chunkIndex = 0;
          while (currentPos < section.length) {
            let nextPos = currentPos + maxChunkLen;
            if (nextPos < section.length) {
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

    const batchSize = 1; // Safer for rate limits and long strings
    const finalData: any[] = [];
    const dataDir = path.join(process.cwd(), "data");
    await fs.mkdir(dataDir, { recursive: true });

    for (let i = 0; i < allChunks.length; i += batchSize) {
      const batch = allChunks.slice(i, i + batchSize);
      const texts = batch.map(c => c.content);
      
      try {
        const embeddings = await createEmbedding(texts);
        
        batch.forEach((chunk, index) => {
          finalData.push({
            ...chunk,
            embedding: embeddings[index]
          });
        });
        
        // Save incrementally for safety
        await fs.writeFile(
          path.join(dataDir, "knowledge_base.json"),
          JSON.stringify(finalData, null, 2)
        );
        
        console.log(`Processed ${finalData.length} / ${allChunks.length} chunks`);
      } catch (err: any) {
        console.error(`Error in batch ${Math.floor(i / batchSize) + 1}:`, err.message);
        // Simple retry once after 5s
        await new Promise(resolve => setTimeout(resolve, 5000));
        i -= batchSize; 
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: `Indexed ${allChunks.length} chunks from ${mdFiles.length} files.` 
    });
  } catch (error: any) {
    console.error("Indexing error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
