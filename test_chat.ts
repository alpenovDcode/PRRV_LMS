import fs from 'fs/promises';
import path from 'path';
import Replicate from 'replicate';

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const EMBEDDING_MODEL = "ibm-granite/granite-embedding-278m-multilingual";
const LLM_MODEL = "meta/llama-3.1-8b-instruct";

function cosineSimilarity(vecA: number[], vecB: number[]) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const magA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const magB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
  if (magA === 0 || magB === 0) return 0;
  const score = dotProduct / (magA * magB);
  return score;
}

async function testChat(query: string) {
  try {
    console.log(`Query: ${query}`);
    
    // 1. Embedding
    const outputEmbed = await replicate.run(EMBEDDING_MODEL, {
      input: { texts: [query] }
    });
    console.log("Output structure:", JSON.stringify(outputEmbed).slice(0, 100));
    const queryVector = (outputEmbed as any)[0];
    if (!queryVector) throw new Error("Could not find embedding in response");
    console.log(`Query vector length: ${queryVector.length}`);

    // 2. Search
    const kbPath = path.join(process.cwd(), "data/knowledge_base.json");
    const kbData = JSON.parse(await fs.readFile(kbPath, "utf-8"));

    const matches = kbData
      .filter((chunk: any) => chunk.embedding && Array.isArray(chunk.embedding))
      .map((chunk: any) => ({
        ...chunk,
        score: cosineSimilarity(queryVector, chunk.embedding)
      }))
      .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
      .slice(0, 3);

    console.log("Top matches:");
    matches.forEach((m: { score: number; metadata: { title: string }; embedding: number[] }, i: number) => {
      console.log(`- [${m.score.toFixed(4)}] ${m.metadata.title}`);
      if (i === 0) {
        console.log("Query (first 5):", queryVector.slice(0, 5));
        console.log("Match (first 5):", m.embedding.slice(0, 5));
      }
    });

    // 3. LLM
    const context = matches.map((m: any) => `[Source: ${m.source}]\n${m.content}`).join("\n\n---\n\n");
    const systemPrompt = `You are a helpful AI assistant for the "Proryv" LMS platform. 
Use the provided knowledge base context to answer the user's question. 
Answer in Russian.

Context:
${context}`;

    const fullPrompt = `system: ${systemPrompt}\nuser: ${query}\nassistant:`;

    console.log("Generating response...");
    const outputLLM = await replicate.run(LLM_MODEL, {
      input: {
        prompt: fullPrompt,
        max_new_tokens: 512,
      },
    });

    const response = typeof outputLLM === 'string' ? outputLLM : (outputLLM as string[]).join("");
    console.log("\nAI Response:");
    console.log(response);

  } catch (err) {
    console.error(err);
  }
}

const query = process.argv[2] || "Как не попасть на блокировку аккаунта на профи?";
testChat(query);
