import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { createEmbedding, replicate, LLM_MODEL } from "@/lib/ai/replicate";

function cosineSimilarity(vecA: number[], vecB: number[]) {
  const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const magA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const magB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
  if (magA === 0 || magB === 0) return 0;
  return dotProduct / (magA * magB);
}

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();
    const lastMessage = messages[messages.length - 1].content;

    // 1. Get embedding for the query
    console.log("Generating query embedding...");
    const queryEmbeddings = await createEmbedding(lastMessage);
    const queryVector = queryEmbeddings[0]; // Granite returns [[...], [...]]

    // 2. Load KB
    const kbPath = path.join(process.cwd(), "data/knowledge_base.json");
    const kbData = JSON.parse(await fs.readFile(kbPath, "utf-8"));

    // 3. Find top-k chunks
    const matches = kbData
      .map((chunk: any) => ({
        ...chunk,
        score: cosineSimilarity(queryVector, chunk.embedding)
      }))
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 5);

    console.log(`Found ${matches.length} relevant chunks.`);

    // 4. Construct context
    const context = matches.map((m: any) => `[Source: ${m.source}, Title: ${m.metadata.title}]\n${m.content}`).join("\n\n---\n\n");

    // 5. Call LLM
    const systemPrompt = `You are a helpful AI assistant for the "Proryv" LMS platform. 
Use the provided knowledge base context to answer the user's question. 
If the answer is not in the context, say that you don't know based on the knowledge base, but try to be helpful.
Answer in the same language as the user (Russian). 
Format your output in clean Markdown.

Context:
${context}`;

    const prompt = messages.map((m: any) => `${m.role === 'user' ? 'user' : 'assistant'}: ${m.content}`).join("\n");
    const fullPrompt = `system: ${systemPrompt}\n${prompt}\nassistant:`;

    console.log("Generating LLM response...");
    
    // We'll use a standard non-streaming response for simplicity first, 
    // but in a real app we'd use Vercel AI SDK for streaming.
    const output = await replicate.run(LLM_MODEL, {
      input: {
        prompt: fullPrompt,
        max_new_tokens: 1024,
        temperature: 0.7,
      },
    });

    const responseText = typeof output === 'string' ? output : (output as string[]).join("");

    return NextResponse.json({ 
      role: 'assistant', 
      content: responseText 
    });

  } catch (error: any) {
    console.error("Chat error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
