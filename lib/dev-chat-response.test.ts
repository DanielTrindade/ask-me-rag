import { describe, expect, it } from 'vitest';
import { DEVELOPMENT_MARKDOWN_RESPONSE } from '@/lib/dev-chat-response';

describe('DEVELOPMENT_MARKDOWN_RESPONSE', () => {
  it('covers the rich Markdown elements used by the chat preview', () => {
    expect(DEVELOPMENT_MARKDOWN_RESPONSE).toContain('# Resposta de desenvolvimento');
    expect(DEVELOPMENT_MARKDOWN_RESPONSE).toContain('**negrito**');
    expect(DEVELOPMENT_MARKDOWN_RESPONSE).toContain('```ts');
    expect(DEVELOPMENT_MARKDOWN_RESPONSE).toContain('| Componente | Estado |');
    expect(DEVELOPMENT_MARKDOWN_RESPONSE).toContain('> O modo de desenvolvimento');
  });
});
