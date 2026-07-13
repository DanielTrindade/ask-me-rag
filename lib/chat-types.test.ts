import { describe, expect, it } from 'vitest';
import { getMessageSources, type PortfolioUIMessage } from './chat-types';

describe('getMessageSources', () => {
  it('returns only valid source references', () => {
    const message = {
      id: 'assistant-1',
      role: 'assistant',
      parts: [
        {
          type: 'data-sources',
          data: {
            sources: [
              { name: 'portfolio.md', matchedChunks: 2 },
              { name: '', matchedChunks: 1 },
              { name: 'invalid.md', matchedChunks: 0 },
            ],
          },
        },
      ],
    } as PortfolioUIMessage;

    expect(getMessageSources(message)).toEqual([
      { name: 'portfolio.md', matchedChunks: 2 },
    ]);
  });

  it('ignores malformed source parts restored from storage', () => {
    const message = {
      id: 'assistant-1',
      role: 'assistant',
      parts: [{ type: 'data-sources' }],
    } as unknown as PortfolioUIMessage;

    expect(getMessageSources(message)).toEqual([]);
  });
});
