import Replicate from "replicate";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export const EMBEDDING_MODEL = "ibm-granite/granite-embedding-278m-multilingual";
export const LLM_MODEL = "meta/llama-2-70b-chat";

export async function createEmbedding(text: string | string[]) {
  const texts = Array.isArray(text) ? text : [text];
  const output: any = await replicate.run(EMBEDDING_MODEL, {
    input: { texts },
  });
  // Granite returns an array of vectors directly
  return output as number[][];
}

export async function generateChatResponse(messages: { role: string; content: string }[]) {
  const output = await replicate.run(LLM_MODEL, {
    input: {
      prompt: messages.map(m => `${m.role}: ${m.content}`).join("\n") + "\nassistant:",
      max_new_tokens: 1024,
      temperature: 0.7,
    },
  });
  return typeof output === 'string' ? output : (output as string[]).join("");
}

export { replicate };
