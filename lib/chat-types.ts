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
