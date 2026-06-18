import { google } from '@ai-sdk/google';
import { embed, embedMany } from 'ai';

// Gemini embeddings. The output dimension is pinned to 1536 so it matches the
// existing Supabase `vector(1536)` schema (gemini-embedding-001 defaults to 3072).
const embeddingModel = google.embedding('gemini-embedding-001');
const providerOptions = { google: { outputDimensionality: 1536 } };

export async function embedText(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: embeddingModel,
    value: text,
    providerOptions,
  });
  return embedding;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({
    model: embeddingModel,
    values: texts,
    providerOptions,
  });
  return embeddings;
}
