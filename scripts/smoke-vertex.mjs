import { createVertex } from '@ai-sdk/google-vertex';
import { embed } from 'ai';

const project = process.env.GOOGLE_VERTEX_PROJECT?.trim();
const location = process.env.GOOGLE_VERTEX_LOCATION?.trim();
const embeddingModel =
  process.env.GOOGLE_VERTEX_EMBEDDING_MODEL?.trim() || 'gemini-embedding-001';

if (!project || !location) {
  console.error('[vertex-smoke] GOOGLE_VERTEX_PROJECT and GOOGLE_VERTEX_LOCATION are required.');
  process.exit(2);
}

if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
  console.error('[vertex-smoke] Explicit credential files are forbidden; use ADC.');
  process.exit(2);
}

try {
  const vertex = createVertex({ project, location });
  const embeddingResult = await embed({
    model: vertex.embeddingModel(embeddingModel),
    value: 'Vertex ADC smoke test',
    providerOptions: {
      google: {
        outputDimensionality: 1536,
        taskType: 'RETRIEVAL_QUERY',
      },
    },
  });

  if (embeddingResult.embedding.length !== 1536) {
    throw new Error('embedding_dimension_mismatch');
  }

  console.log(JSON.stringify({
    status: 'ok',
    provider: 'vertex-embedding',
    project,
    location,
    embeddingModel,
    embeddingDimension: embeddingResult.embedding.length,
  }));
} catch (error) {
  const category = error instanceof Error ? error.name : 'UnknownError';
  console.error(JSON.stringify({ status: 'failed', category }));
  process.exit(1);
}
