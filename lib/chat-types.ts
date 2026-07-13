import type { UIMessage } from 'ai';

export type SourceReference = {
  name: string;
  matchedChunks: number;
};

export type PortfolioUIMessage = UIMessage<
  unknown,
  {
    sources: {
      sources: SourceReference[];
    };
  }
>;

export function getMessageSources(message: PortfolioUIMessage): SourceReference[] {
  const part = message.parts.find((candidate) => candidate.type === 'data-sources');
  return part?.data.sources ?? [];
}
