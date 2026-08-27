# Renderização segura de quebras de linha do modelo — Implementation Plan

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIA: use `subagent-driven-development` (recomendado) ou `executing-plans` para implementar este plano tarefa por tarefa. Os passos usam caixas de seleção (`- [ ]`) para acompanhamento.

**Goal:** Impedir que variantes de `<br>` apareçam como texto nas mensagens do assistente, sem habilitar HTML arbitrário nem enfraquecer a segurança do renderer Markdown.

**Architecture:** Encapsular o `Markdown` do Astryx em um componente dedicado para respostas do assistente. Usar a API pública `inlinePlugins` do Astryx 0.1.1 para converter exclusivamente `<br>`, `<br/>` e `<br />` em elementos React `<br />`; todo outro HTML continua sendo texto literal e blocos de código permanecem intocados.

**Tech Stack:** React 19, TypeScript 5, Astryx Design System 0.1.1, Testing Library 16, Vitest 4.

## Restrições globais

- Não usar `dangerouslySetInnerHTML`.
- Não instalar `rehype-raw`, parser HTML ou outra dependência.
- Não habilitar HTML cru de forma genérica.
- Reconhecer as variantes `<br>`, `<br/>`, `<br />` e diferenças de maiúsculas/minúsculas.
- Preservar `<br>` literal dentro de código inline e blocos cercados por crases.
- Preservar o Markdown já suportado: títulos, listas, tabelas, links, citações e blocos de código.
- Preservar o comportamento de streaming do componente Astryx.
- Todo outro HTML, inclusive `<script>`, deve continuar visível como texto inofensivo e nunca virar elemento DOM executável.
- Não alterar CSS: a quebra nativa já herda a tipografia e o espaçamento do parágrafo.
- Toda alteração deve ser conduzida com testes antes da implementação e commits pequenos por tarefa.

---

## Estrutura de arquivos

- Criar `components/chat/assistant-markdown.tsx`: configuração segura e única do Markdown usado pelo assistente.
- Criar `components/chat/assistant-markdown.test.tsx`: regressões para `<br>`, código e HTML arbitrário.
- Modificar `components/chat/message.tsx`: delegar a renderização da resposta ao novo componente.
- Modificar `components/chat/chat.test.tsx`: provar que a mensagem completa não mostra a tag literal.

### Task 1: Componente de Markdown com exceção controlada para `<br>`

**Files:**
- Create: `components/chat/assistant-markdown.tsx`
- Create: `components/chat/assistant-markdown.test.tsx`

**Interfaces:**
- Consumes: `Markdown` e `MarkdownInlinePlugin` de `@astryxdesign/core/Markdown`.
- Produces: `AssistantMarkdown({ children, isStreaming }): ReactElement`.

- [ ] **Step 1: Escrever os testes falhos do comportamento visual e de segurança**

Criar `components/chat/assistant-markdown.test.tsx`:

```tsx
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AssistantMarkdown } from './assistant-markdown';

describe('AssistantMarkdown', () => {
  it.each(['<br>', '<br/>', '<br />', '<BR />'])(
    'renderiza %s como quebra de linha sem exibir a tag',
    (tag) => {
      const { container } = render(
        <AssistantMarkdown>{`Primeira linha${tag}Segunda linha`}</AssistantMarkdown>,
      );

      expect(container.querySelectorAll('br')).toHaveLength(1);
      expect(screen.queryByText(tag)).not.toBeInTheDocument();
      expect(screen.getByText(/Primeira linha/)).toBeInTheDocument();
      expect(screen.getByText(/Segunda linha/)).toBeInTheDocument();
    },
  );

  it('não interpreta outros elementos HTML', () => {
    const { container } = render(
      <AssistantMarkdown>{'<script>alert(1)</script><b>texto</b>'}</AssistantMarkdown>,
    );

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument();
    expect(screen.getByText(/<b>texto<\/b>/)).toBeInTheDocument();
  });

  it('preserva a sequência dentro de código inline', () => {
    const { container } = render(
      <AssistantMarkdown>{'Use `<br>` somente como exemplo.'}</AssistantMarkdown>,
    );

    expect(container.querySelectorAll('br')).toHaveLength(0);
    expect(screen.getByText('<br>').tagName).toBe('CODE');
  });

  it('preserva a sequência dentro de bloco de código', () => {
    const { container } = render(
      <AssistantMarkdown>{'```html\n<div>texto<br>texto</div>\n```'}</AssistantMarkdown>,
    );

    expect(container.querySelectorAll('br')).toHaveLength(0);
    expect(screen.getByText(/<div>texto<br>texto<\/div>/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Executar o teste e confirmar a falha**

Run: `npm test -- components/chat/assistant-markdown.test.tsx`

Expected: FAIL porque o componente ainda não existe.

- [ ] **Step 3: Implementar o wrapper com `inlinePlugins`**

Criar `components/chat/assistant-markdown.tsx`:

```tsx
'use client';

import {
  Markdown,
  type MarkdownInlinePlugin,
} from '@astryxdesign/core/Markdown';

const htmlLineBreakPlugin: MarkdownInlinePlugin = {
  pattern: /<br\s*\/?>/gi,
  render: (_match, key) => <br key={key} />,
};

const assistantMarkdownPlugins = [htmlLineBreakPlugin];

export function AssistantMarkdown({
  children,
  isStreaming = false,
}: {
  children: string;
  isStreaming?: boolean;
}) {
  return (
    <Markdown
      className="assistant-markdown"
      density="default"
      headingLevelStart={2}
      isStreaming={isStreaming}
      contentWidth="100%"
      autolink="gfm"
      inlinePlugins={assistantMarkdownPlugins}
    >
      {children}
    </Markdown>
  );
}
```

O plugin atua somente em nós de texto produzidos pelo parser do Astryx. Pela API instalada, código inline e blocos de código não passam por `inlinePlugins`, atendendo à restrição sem análise manual de cercas Markdown.

- [ ] **Step 4: Executar os testes do wrapper**

Run: `npm test -- components/chat/assistant-markdown.test.tsx`

Expected: PASS para as quatro variantes de quebra, HTML arbitrário e exemplos de código.

- [ ] **Step 5: Commitar o wrapper seguro**

```bash
git add components/chat/assistant-markdown.tsx components/chat/assistant-markdown.test.tsx
git commit -m "fix: render model line breaks safely"
```

### Task 2: Usar o wrapper nas mensagens do assistente

**Files:**
- Modify: `components/chat/message.tsx:1-100`
- Modify: `components/chat/chat.test.tsx:1-180`

**Interfaces:**
- Consumes: `AssistantMarkdown` criado na Task 1.
- Produces: todas as mensagens do assistente, inclusive restauradas da sessão e recebidas do cache, passam pela exceção controlada.

- [ ] **Step 1: Escrever o teste falho na integração completa do chat**

Adicionar a `components/chat/chat.test.tsx`:

```tsx
it('não exibe br literal em resposta do assistente', () => {
  mocks.messages = [{
    id: 'assistant-line-break',
    role: 'assistant',
    parts: [{
      type: 'text',
      text: 'Primeira experiência.<br>Segunda experiência.',
    }],
  }];

  const { container } = render(<Chat />);

  expect(container.querySelectorAll('.assistant-message-bubble br')).toHaveLength(1);
  expect(screen.queryByText(/<br>/)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Executar o teste de integração e confirmar a falha**

Run: `npm test -- components/chat/chat.test.tsx -t "não exibe br literal"`

Expected: FAIL porque `Message` ainda usa `Markdown` diretamente, sem plugin.

- [ ] **Step 3: Substituir o uso direto do Markdown**

Em `components/chat/message.tsx`, remover:

```tsx
import { Markdown } from '@astryxdesign/core/Markdown';
```

Adicionar:

```tsx
import { AssistantMarkdown } from '@/components/chat/assistant-markdown';
```

Substituir o bloco da resposta do assistente por:

```tsx
<AssistantMarkdown isStreaming={isStreaming}>
  {children}
</AssistantMarkdown>
```

Não alterar o ramo da mensagem do usuário, os metadados, copiar, retry ou status degradado.

- [ ] **Step 4: Executar os testes do componente e do chat**

Run: `npm test -- components/chat/assistant-markdown.test.tsx components/chat/chat.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commitar a integração**

```bash
git add components/chat/message.tsx components/chat/chat.test.tsx
git commit -m "fix: hide literal br tags in chat messages"
```

### Task 3: Verificação visual e regressão global

**Files:**
- Verify: `components/chat/assistant-markdown.tsx`
- Verify: `components/chat/message.tsx`
- Verify: `app/globals.css:276-314`

**Interfaces:**
- Consumes: build de desenvolvimento e resposta Markdown fixa existente.
- Produces: confirmação de que a exceção não altera layout, streaming nem segurança.

- [ ] **Step 1: Rodar todos os testes**

Run: `npm test`

Expected: todos os testes aprovados.

- [ ] **Step 2: Rodar lint e build**

Run: `npm run lint`

Expected: zero erros.

Run: `npm run build`

Expected: build de produção concluído.

- [ ] **Step 3: Validar manualmente as cinco entradas de renderização**

Durante a execução local, injetar cada conteúdo como mensagem de assistente no teste visual e confirmar:

```md
Primeira linha<br>Segunda linha

Primeira linha<br/>Segunda linha

Primeira linha<BR />Segunda linha

Use `<br>` como texto de código.

<script>alert(1)</script>
```

Expected:

- as três primeiras entradas exibem duas linhas sem mostrar a tag;
- a quarta exibe `<br>` como código;
- a quinta exibe texto literal e não cria um elemento `<script>`;
- nenhuma entrada produz overflow, espaçamento extra ou alteração nos botões de copiar/repetir.

- [ ] **Step 4: Confirmar que nenhum escape inseguro foi introduzido**

Run: `rg -n "dangerouslySetInnerHTML|rehype-raw|rehypeRaw" components app lib package.json`

Expected: nenhuma ocorrência nova relacionada ao chat.

## Critérios de aceitação

- Nenhuma variante suportada de `<br>` aparece literalmente no texto do assistente.
- As variantes são renderizadas como uma única quebra de linha.
- `<br>` em código inline ou cercado continua literal.
- `<script>`, `<iframe>`, `<img onerror>` e outras tags continuam texto, nunca DOM executável.
- Markdown comum e streaming continuam funcionando.
- Mensagens vindas de streaming, cache e `sessionStorage` usam o mesmo renderer.
- Nenhuma dependência ou regra CSS é adicionada.
