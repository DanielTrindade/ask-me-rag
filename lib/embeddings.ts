import { openai } from '@ai-sdk/openai';
import { embed, embedMany } from 'ai';

const embeddingModel = openai.embedding('text-embedding-3-small');

export async function embedText(text: string): Promise<number[]> {
  const { embedding } = await embed({ model: embeddingModel, value: text });
  return embedding;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({ model: embeddingModel, values: texts });
  return embeddings;
}
