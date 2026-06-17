# ask-me-rag — Design Doc

**Data:** 2026-06-17
**Status:** Aprovado (aguardando revisão do spec)

## 1. Visão geral

`ask-me-rag` é uma aplicação de portfólio: um chatbot **"Pergunte sobre mim"** com
streaming, RAG e provedor de LLM alternável (Claude ⇄ GPT). Visitantes conversam
com uma base de conhecimento construída a partir dos documentos do dono (CV,
projetos, experiências). O upload dos documentos é protegido (admin).

Objetivo: demonstrar, com código limpo e legível, as habilidades mais valorizadas
hoje — **streaming**, **multi-provider** e **RAG** — embaladas num frontend com
craft (filosofia de design engineering do Emil Kowalski).

## 2. Stack

| Camada | Escolha |
| --- | --- |
| Framework | Next.js 15 (App Router) + TypeScript |
| Estilo | Tailwind CSS + Radix UI (primitivos acessíveis, popovers origin-aware) |
| Animação | Motion (ex-Framer Motion) — só onde há física/gesto; CSS transitions para o resto |
| LLM | Vercel AI SDK: `ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai` |
| Embeddings | OpenAI `text-embedding-3-small` (1536 dims) |
| Vector DB | Supabase Postgres + pgvector |
| Parsing | `unpdf` (serverless-friendly, lê PDF/texto) |
| i18n | PT/EN com toggle |
| Deploy | Vercel |

**Decisão-chave (Opção A):** usar o **Vercel AI SDK** em vez de SDKs crus ou
LangChain. `streamText` abstrai os dois provedores; o hook `useChat` entrega
streaming ao front com mínimo código. Troca de provedor = trocar um objeto de modelo.

**Nota sobre embeddings:** a Anthropic não tem API de embeddings própria. Por isso,
independentemente do provedor de chat selecionado, a indexação usa embeddings da
OpenAI (`text-embedding-3-small`). Isso é transparente para o usuário do chat.

## 3. Arquitetura

### Rotas / telas
- `/` — **chat público** ("Pergunte sobre mim"). Usa `useChat` → `POST /api/chat`.
- `/admin` — **upload protegido** por senha. Sobe PDF/MD/TXT → `POST /api/ingest`.
- `/api/chat` — embeda a pergunta, busca vetorial, monta contexto, `streamText`, streama.
- `/api/ingest` — valida token admin, parseia, chunk, embeda, insere no Supabase.

### Estrutura de pastas
```
app/
  layout.tsx
  page.tsx                 # chat
  admin/page.tsx           # upload protegido
  api/chat/route.ts
  api/ingest/route.ts
lib/
  llm.ts                   # seleção de provedor (Claude/GPT) via LLM_PROVIDER
  embeddings.ts            # wrapper text-embedding-3-small
  supabase.ts              # client + helpers
  chunk.ts                 # divisão de texto em chunks com overlap
  rag.ts                   # retrieve: embed query → match_documents → contexto
  i18n.ts                  # dicionários PT/EN + helper
components/
  chat/...                 # UI do chat (mensagens, input, indicador "pensando")
  upload/...               # UI do upload admin
  ui/...                   # primitivos (button, toast, etc.)
supabase/
  schema.sql               # tabela documents + função match_documents
.env.example
README.md                  # setup, diagrama de arquitetura, prints
```

## 4. Banco de dados (Supabase / pgvector)

Tabela `documents`:

| Coluna | Tipo |
| --- | --- |
| `id` | `bigint` identity PK |
| `content` | `text` (o chunk) |
| `embedding` | `vector(1536)` |
| `metadata` | `jsonb` (ex: nome do arquivo, índice do chunk) |
| `created_at` | `timestamptz default now()` |

Índice ivfflat/hnsw em `embedding` para busca por similaridade.

Função RPC `match_documents(query_embedding vector(1536), match_count int, match_threshold float)`:
retorna os top-k chunks ordenados por similaridade de cosseno acima do threshold.

Tudo versionado em `supabase/schema.sql`.

## 5. Fluxos de dados

### Chat
1. Usuário envia pergunta (`useChat`).
2. `/api/chat` gera embedding da pergunta (`text-embedding-3-small`).
3. Chama `match_documents` → top-k chunks relevantes.
4. Monta system prompt com o contexto recuperado + instrução anti-alucinação
   ("se a resposta não estiver no contexto, diga que não sabe").
5. `streamText({ model })` com o provedor escolhido por `LLM_PROVIDER`.
6. Tokens são streamados de volta para a UI.

### Ingestão (admin)
1. Admin faz login simples e sobe arquivo em `/admin`.
2. `/api/ingest` valida `x-admin-token` contra `ADMIN_PASSWORD`.
3. Valida tipo/tamanho do arquivo.
4. Extrai texto (`unpdf` para PDF; leitura direta para MD/TXT).
5. Divide em chunks (~500 tokens, com overlap).
6. Gera embedding de cada chunk e insere as linhas em `documents`.

## 6. Frontend — craft (design engineering)

Estética: **claro e clean** (tipo Notion/Claude). Tipografia forte, espaçamento
generoso, acentos sutis.

Princípios aplicados:
- Animar **apenas onde há propósito** (entrada de mensagens, drawer/modal de upload,
  toasts). Nada de animar ações repetidas.
- Easing custom `ease-out` (`cubic-bezier(0.23, 1, 0.32, 1)`); durações < 300ms para UI.
- Mensagens entram com `opacity` + `translateY` pequeno; stagger sutil (30–80ms).
- Botões com `transform: scale(0.97)` no `:active`, feedback < 160ms.
- Streaming sem "pulos" de layout — animar só `transform`/`opacity`.
- Indicador de "pensando" que faz o app *parecer* rápido.
- Toasts (estilo Sonner) para erros; bons defaults > muitas opções.
- `prefers-reduced-motion` respeitado (mantém fade/cor, remove movimento).
- Popovers origin-aware via variáveis do Radix; modais permanecem centrados.

## 7. Segurança e tratamento de erros

- **Acesso ao upload:** `ADMIN_PASSWORD` (env) verificado no `/api/ingest` e na tela
  `/admin`. Deliberadamente simples — sem sistema de auth completo. O README deixa
  isso explícito como decisão de escopo.
- **Validação de arquivo:** tipo (PDF/MD/TXT) e tamanho máximo no upload.
- **Falta de API key:** erro amigável + checagem no boot.
- **Sem contexto relevante:** system prompt instrui o modelo a admitir que não sabe.
- **Falha de parsing/embed/insert:** mensagem clara via toast; logs no servidor.

## 8. Testes (leves — escopo de portfólio)

- **Unit:** `chunk.ts` (divisão correta + overlap), `rag.ts` (montagem de contexto),
  `llm.ts` (seleção de provedor por env).
- **Smoke (opcional):** rota `/api/chat` responde com stream válido (mockando o SDK).

## 9. Fora de escopo (YAGNI)

- Autenticação completa / multiusuário.
- Isolamento de sessões por visitante (a base é única, do dono).
- Vector DB hospedado dedicado (Pinecone etc.).
- UI de upload pública para visitantes.
- Histórico de conversa persistido por usuário.

## 10. README (peça-chave do portfólio)

Deve conter: descrição do projeto, GIF/prints do chat, **diagrama de arquitetura**,
explicação do fluxo RAG, instruções de setup (env vars, schema Supabase, `npm run dev`),
e nota sobre as decisões de escopo (auth simples, embeddings OpenAI).
