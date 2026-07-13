import type { UIMessage } from 'ai';

export type SourceReference = {
  name: string;
  matchedChunks: number;
};

export const SOURCE_DATA_PART_ID = 'retrieval-sources';

export type PortfolioUIMessage = UIMessage<
  unknown,
  {
    sources: {
      sources: SourceReference[];
    };
  }
>;

export function createSourcesDataPart(sources: SourceReference[]) {
  return {
    type: 'data-sources' as const,
    id: SOURCE_DATA_PART_ID,
    data: { sources },
  };
}

export function getMessageSources(message: PortfolioUIMessage): SourceReference[] {
  const part = message.parts.find((candidate) => candidate.type === 'data-sources');
  if (!part || !part.data || !Array.isArray(part.data.sources)) return [];

  return part.data.sources.filter(
    (source): source is SourceReference =>
      Boolean(source) &&
      typeof source === 'object' &&
      typeof source.name === 'string' &&
      source.name.trim().length > 0 &&
      typeof source.matchedChunks === 'number' &&
      Number.isFinite(source.matchedChunks) &&
      source.matchedChunks > 0,
  );
}
