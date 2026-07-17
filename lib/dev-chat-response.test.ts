import { describe, expect, it } from 'vitest';
import { createDevelopmentChatResponse, DEVELOPMENT_MARKDOWN_RESPONSE } from '@/lib/dev-chat-response';

describe('DEVELOPMENT_MARKDOWN_RESPONSE', () => {
  it('covers the rich Markdown elements used by the chat preview', () => {
    expect(DEVELOPMENT_MARKDOWN_RESPONSE).toContain('# Resposta de desenvolvimento');
    expect(DEVELOPMENT_MARKDOWN_RESPONSE).toContain('**negrito**');
    expect(DEVELOPMENT_MARKDOWN_RESPONSE).toContain('```ts');
    expect(DEVELOPMENT_MARKDOWN_RESPONSE).toContain('| Componente | Estado |');
    expect(DEVELOPMENT_MARKDOWN_RESPONSE).toContain('> O modo de desenvolvimento');
  });

  it('streams markdown without reintroducing source metadata', async () => {
    const response = createDevelopmentChatResponse();
    const body = await response.text();

    expect(body).toContain('text-delta');
    expect(body).not.toContain('data-sources');
  });

});
