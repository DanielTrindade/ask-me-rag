import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import { createSourcesDataPart, type PortfolioUIMessage } from '@/lib/chat-types';

export const DEVELOPMENT_MARKDOWN_RESPONSE = `# Resposta de desenvolvimento

Esta resposta é gerada **localmente** e não consulta o modelo nem a base vetorial. Ela existe para validar a apresentação do chat durante o desenvolvimento.

## Formatações verificadas

- Texto em **negrito** e em *itálico*.
- Código inline, como \`const ambiente = 'dev'\`.
- Links: [documentação do Next.js](https://nextjs.org/docs).
- Listas, citações, tabelas e blocos de código.

> O modo de desenvolvimento evita consumo de API e mantém uma saída previsível para revisão visual.

### Exemplo de código

\`\`\`ts
type Ambiente = 'development' | 'production';

const ambiente: Ambiente = 'development';
console.log({ ambiente, markdown: true });
\`\`\`

### Estado dos componentes

| Componente | Estado |
| --- | --- |
| Coluna de conversa | Limitada e centralizada |
| Markdown | Renderizado |
| Streaming | Simulado |

1. Envie qualquer pergunta.
2. Confira a hierarquia tipográfica.
3. Valide listas, código e tabela.`;

interface DevelopmentChatResponseOptions {
  originalMessages?: PortfolioUIMessage[];
  onFinish?: (event: {
    messages: PortfolioUIMessage[];
    isContinuation: boolean;
    isAborted: boolean;
    responseMessage: PortfolioUIMessage;
    finishReason?: string;
  }) => PromiseLike<void> | void;
}

export function createDevelopmentChatResponse(
  options: DevelopmentChatResponseOptions = {},
) {
  const stream = createUIMessageStream<PortfolioUIMessage>({
    originalMessages: options.originalMessages,
    onFinish: options.onFinish,
    async execute({ writer }) {
      writer.write(
        createSourcesDataPart([{ name: 'preview-profissional.md', matchedChunks: 2 }]),
      );

      const id = 'development-markdown-response';
      writer.write({ type: 'text-start', id });

      const chunks = DEVELOPMENT_MARKDOWN_RESPONSE.split(/(?<=\n\n)/);
      for (const delta of chunks) {
        writer.write({ type: 'text-delta', id, delta });
        await new Promise((resolve) => setTimeout(resolve, 35));
      }

      writer.write({ type: 'text-end', id });
    },
  });

  return createUIMessageStreamResponse({
    stream,
    consumeSseStream: ({ stream: copy }) => copy.pipeTo(new WritableStream()),
  });
}
