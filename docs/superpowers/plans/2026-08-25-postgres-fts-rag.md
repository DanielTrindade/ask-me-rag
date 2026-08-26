# PostgreSQL Full-Text Search RAG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir embeddings Google/Vertex por recuperação bilíngue com PostgreSQL Full-Text Search, mantendo Groq GPT-OSS como único provedor de IA.

**Architecture:** O PostgreSQL mantém uma coluna `tsvector` combinando análise portuguesa e inglesa, normalizada por `unaccent`, atualizada por trigger e indexada por GIN. A aplicação envia pergunta, locale e limite ao RPC `search_documents`, monta o contexto dentro do orçamento existente e chama somente o Groq para geração. A migração é expansiva e preserva os contratos pgvector até uma contração posterior, permitindo rollback da revisão atual.

**Tech Stack:** PostgreSQL/Supabase migrations + pgTAP, Next.js 16, TypeScript, Supabase JS, Vercel AI SDK 6, Groq GPT-OSS, Vitest, Cloud Run e GitHub Actions.

## Global Constraints

- Preservar conteúdo e metadados de todos os documentos existentes; não exigir reingestão.
- Suportar perguntas e documentos em português e inglês, com correspondência insensível a acentos.
- Não chamar Groq no health check e não adicionar outro provedor ou modelo de embeddings.
- Manter `match_documents`, `documents.embedding`, o índice HNSW e o cache SQL de embeddings durante esta mudança expansiva para rollback seguro.
- Remover Google/Vertex do código e da configuração da nova revisão Cloud Run.
- Aplicar edições textuais com UTF-8 e preservar acentos e pontuação.

---

## File Structure

- `supabase/migrations/0008_postgres_fts_rag.sql`: adiciona e preenche o índice FTS sem contrair o schema vetorial.
- `supabase/tests/0008_postgres_fts_rag_test.sql`: prova indexação, idioma, acentos, trigger, ranking e privilégios.
- `supabase/schema.sql`: espelho expansivo do schema após a migração 0008.
- `lib/rag.ts`: único adapter de recuperação; converte locale e chama `search_documents`.
- `app/api/chat/route.ts`: fornece o locale já resolvido à recuperação.
- `app/api/ingest/route.ts`: persiste chunks sem embeddings.
- `app/api/health/route.ts`: prova a disponibilidade do RPC FTS.
- `lib/ai/runtime-contracts.ts`: mantém somente contratos do chat Groq.
- `lib/ai/cache.ts`, `lib/ai/cache-store.ts`, `lib/ai/governance-config.ts`: mantêm somente cache de resposta e governança aplicável.
- `scripts/*.sh`, `cloudbuild*.yaml`, `.github/workflows/*.yml`: deixam de transportar configuração Google/Vertex e limpam a nova revisão.
- `.env.example`, `README.md`, `docs/ai-providers.md`, `docs/ai-usage-runbook.md`, `docs/database-migrations.md`, `lib/i18n.ts`: documentam o runtime Groq + PostgreSQL FTS.
- Remover: `lib/embeddings.ts`, `lib/embeddings.test.ts`, `lib/ai/vertex.ts`, `lib/ai/vertex.test.ts`, `scripts/smoke-vertex.mjs`.

### Task 1: Índice e RPC Full-Text Search

**Files:**
- Create: `supabase/tests/0008_postgres_fts_rag_test.sql`
- Create: `supabase/migrations/0008_postgres_fts_rag.sql`
- Modify: `supabase/schema.sql`

**Interfaces:**
- Produces: `search_documents(query_text text, query_language text, match_count integer) returns table(id bigint, content text, metadata jsonb, rank double precision)`.
- Produces: `documents.search_vector tsvector`, preenchido pelo trigger `documents_search_vector_update`.

- [ ] **Step 1: Escrever o teste pgTAP que falha sem o schema FTS**

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select ok(
  exists(select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'documents' and column_name = 'search_vector'),
  'documents possui search_vector'
);
select ok(
  has_function_privilege('service_role', 'search_documents(text,text,integer)', 'execute'),
  'service_role pode pesquisar documentos'
);
select ok(
  not has_function_privilege('anon', 'search_documents(text,text,integer)', 'execute'),
  'anon não pode pesquisar documentos'
);

insert into documents(content, metadata) values
  ('Experiência profissional com sistemas de pagamentos distribuídos.', '{"source":"cv-pt.md"}'),
  ('Built reliable payment platforms for international customers.', '{"source":"cv-en.md"}'),
  ('Receitas culinárias e jardinagem.', '{"source":"irrelevante.md"}');

select is(
  (select metadata->>'source' from search_documents('experiencia pagamentos', 'portuguese', 3) limit 1),
  'cv-pt.md',
  'busca portuguesa normaliza acentos e ranqueia o trecho esperado'
);
select is(
  (select metadata->>'source' from search_documents('reliable payment platforms', 'english', 3) limit 1),
  'cv-en.md',
  'busca inglesa usa stemming inglês'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Executar o teste para confirmar a falha inicial**

Run: `npm run observability:local:test`

Expected: FAIL porque `documents.search_vector` e `search_documents` ainda não existem.

- [ ] **Step 3: Implementar a migração expansiva**

```sql
create extension if not exists unaccent with schema extensions;
set search_path = public, extensions;

alter table documents add column if not exists search_vector tsvector;

create or replace function update_document_search_vector()
returns trigger
language plpgsql
set search_path = public, extensions, pg_catalog
as $$
declare
  normalized_content text;
begin
  normalized_content := unaccent(coalesce(new.content, ''));
  new.search_vector :=
    to_tsvector('pg_catalog.portuguese', normalized_content) ||
    to_tsvector('pg_catalog.english', normalized_content);
  return new;
end;
$$;

drop trigger if exists documents_search_vector_update on documents;
create trigger documents_search_vector_update
before insert or update of content on documents
for each row execute function update_document_search_vector();

update documents set content = content where search_vector is null;
alter table documents alter column search_vector set not null;
create index if not exists documents_search_vector_idx on documents using gin(search_vector);
```

Implementar o RPC com `websearch_to_tsquery`, idioma restrito a `portuguese|english`, `ts_rank_cd`, retorno vazio para consulta sem nós e limite `greatest(1, least(coalesce(match_count, 5), 8))`. Revogar execução de `public`, `anon`, `authenticated` e conceder somente a `service_role`. Inserir o marcador `0008_postgres_fts_rag` em `schema_migrations`.

- [ ] **Step 4: Espelhar o schema expansivo e executar banco local**

Run: `npm run observability:local:test`

Expected: todas as migrações, testes pgTAP e lint SQL passam; os testes também confirmam que `match_documents` e `documents.embedding` continuam presentes para rollback.

- [ ] **Step 5: Commit do contrato de banco**

```bash
git add supabase/migrations/0008_postgres_fts_rag.sql supabase/tests/0008_postgres_fts_rag_test.sql supabase/schema.sql
git commit -m "feat: add PostgreSQL full-text retrieval"
```

### Task 2: Recuperação, ingestão e health check sem embeddings

**Files:**
- Modify: `lib/rag.test.ts`
- Modify: `lib/rag.ts`
- Modify: `app/api/chat/route.ts`
- Modify: `app/api/chat/route.test.ts`
- Modify: `app/api/ingest/route.ts`
- Modify: `app/api/ingest/route.test.ts`
- Modify: `app/api/health/route.ts`
- Modify: `app/api/health/route.test.ts`

**Interfaces:**
- Consumes: RPC `search_documents` da Task 1.
- Produces: `retrieveContext(query, { language?: 'pt' | 'en'; matchCount?: number; tokenBudget?: number })`.

- [ ] **Step 1: Escrever testes de `retrieveContext` antes da implementação**

```ts
expect(rpc).toHaveBeenCalledWith('search_documents', {
  query_text: 'experiência profissional',
  query_language: 'portuguese',
  match_count: 3,
});

expect(await retrieveContext('payment platforms', { language: 'en' }))
  .toMatchObject({ sources: [{ name: 'cv-en.md', matchedChunks: 1 }] });
```

Cobrir consulta vazia sem RPC, erro sanitizado como `search_documents_failed`, ordenação por `rank` e orçamento de tokens.

- [ ] **Step 2: Executar testes focados para confirmar a falha**

Run: `npm run test -- lib/rag.test.ts app/api/chat/route.test.ts app/api/ingest/route.test.ts app/api/health/route.test.ts`

Expected: FAIL por referências a `embedText`, payload vetorial e health check antigo.

- [ ] **Step 3: Implementar recuperação e passagem de locale**

```ts
const language = opts.language === 'en' ? 'english' : 'portuguese';
const { data, error } = await getServiceClient().rpc('search_documents', {
  query_text: query,
  query_language: language,
  match_count: matchCount,
});
if (error) throw new Error('search_documents_failed');
```

Trocar `similarity` por `rank` em `RetrievedRow`/ordenação e passar `language: locale` em `app/api/chat/route.ts`.

- [ ] **Step 4: Remover embeddings da ingestão**

```ts
const rows = fresh.map((entry) => ({
  content: entry.chunk.content,
  metadata: {
    source,
    chunk: entry.chunk.index,
    chunk_hash: entry.hash,
  },
}));
```

O teste deve verificar que `insert` recebe linhas sem a propriedade `embedding` e que a revisão continua sendo incrementada somente após inserção efetiva.

- [ ] **Step 5: Fazer o health check exercitar o RPC FTS**

```ts
const query = getServiceClient().rpc('search_documents', {
  query_text: 'healthcheck',
  query_language: 'english',
  match_count: 1,
});
```

Manter o timeout de 3 segundos e os corpos públicos `{status:'ok'}` / `{status:'unavailable',reason:'dependency'}`.

- [ ] **Step 6: Rodar os testes focados até passarem**

Run: `npm run test -- lib/rag.test.ts app/api/chat/route.test.ts app/api/ingest/route.test.ts app/api/health/route.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit do fluxo da aplicação**

```bash
git add lib/rag.ts lib/rag.test.ts app/api/chat/route.ts app/api/chat/route.test.ts app/api/ingest/route.ts app/api/ingest/route.test.ts app/api/health/route.ts app/api/health/route.test.ts
git commit -m "refactor: retrieve RAG context with PostgreSQL FTS"
```

### Task 3: Remover runtime e cache TypeScript de embeddings

**Files:**
- Modify: `lib/ai/runtime-contracts.ts`
- Modify: `lib/ai/cache.ts`
- Modify: `lib/ai/cache.test.ts`
- Modify: `lib/ai/cache-store.ts`
- Modify: `lib/ai/governance-config.ts`
- Modify: `lib/ai/governance-config.test.ts`
- Modify: `lib/llm.ts`
- Modify: `lib/llm.test.ts`
- Delete: `lib/embeddings.ts`
- Delete: `lib/embeddings.test.ts`
- Delete: `lib/ai/vertex.ts`
- Delete: `lib/ai/vertex.test.ts`
- Delete: `scripts/smoke-vertex.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Preserves: `ChatRuntime`, `ChatProvider='groq'`, cache de resposta, `getKnowledgeRevision` e `incrementKnowledgeRevision`.
- Removes: `EmbeddingRuntime`, `EmbeddingProvider`, `EmbeddingPurpose`, cache de embedding e flags/TTLs correspondentes.

- [ ] **Step 1: Atualizar expectativas dos testes de runtime, cache e governança**

Remover casos de embedding/Vertex e afirmar que o default de cache contém somente:

```ts
cache: {
  responseEnabled: false,
  responseTtlSeconds: 86_400,
}
```

- [ ] **Step 2: Executar testes focados para localizar contratos residuais**

Run: `npm run test -- lib/llm.test.ts lib/ai/cache.test.ts lib/ai/governance-config.test.ts`

Expected: FAIL enquanto tipos e implementação ainda expõem embeddings.

- [ ] **Step 3: Remover implementação e arquivos específicos**

Remover `buildEmbeddingCacheKey`, `getEmbeddingCache`, `putEmbeddingCache`, campos `embeddingEnabled`/`embeddingTtlSeconds` e o papel `'embedding'` de `AiRuntimeRole`. Simplificar `requiredValue` em `lib/llm.ts` para aceitar somente o papel `'chat'`.

- [ ] **Step 4: Remover dependências com o npm**

Run: `npm uninstall @ai-sdk/google @ai-sdk/google-vertex google-auth-library`

Expected: `package.json` e `package-lock.json` não contêm dependências Google usadas pelo runtime.

- [ ] **Step 5: Rodar os testes focados até passarem**

Run: `npm run test -- lib/llm.test.ts lib/ai/cache.test.ts lib/ai/governance-config.test.ts app/api/chat/route.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit da simplificação de runtime**

```bash
git add -A lib package.json package-lock.json scripts/smoke-vertex.mjs app/api/chat/route.test.ts
git commit -m "refactor: remove embedding runtime dependencies"
```

### Task 4: Simplificar configuração, deploy e operação

**Files:**
- Modify: `scripts/check-ai-config.mjs`
- Modify: `scripts/check-ai-config.test.ts`
- Modify: `scripts/preflight-deploy.sh`
- Modify: `scripts/deploy-cloud-run.sh`
- Modify: `scripts/deploy-cloud-run.test.ts`
- Modify: `scripts/bootstrap-gcp-cicd.sh`
- Modify: `scripts/fill-secrets.sh`
- Modify: `scripts/check-deploy.sh`
- Modify: `scripts/local-observability.mjs`
- Modify: `cloudbuild.yaml`
- Modify: `cloudbuild-promote.yaml`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/deploy.yml`
- Modify: `.env.example`

**Interfaces:**
- Produces: configuração mínima `CHAT_LLM_PROVIDER=groq` + `GROQ_API_KEY`.
- Removes from candidate: `EMBEDDING_*`, `GOOGLE_*`, `LLM_PROVIDER`, `GOOGLE_MODEL`, `ANTHROPIC_API_KEY` e `OPENAI_API_KEY`.

- [ ] **Step 1: Atualizar testes de configuração e deploy**

```ts
expect(result.summary).toBe('chat=groq retrieval=postgres-fts governance=shadow');
expect(calls).toContain('--remove-env-vars=EMBEDDING_PROVIDER,EMBEDDING_MODEL,EMBEDDING_DIMENSION');
expect(calls).toContain('--remove-secrets=GOOGLE_GENERATIVE_AI_API_KEY,ANTHROPIC_API_KEY,OPENAI_API_KEY');
```

- [ ] **Step 2: Remover validações e transporte de embeddings**

Excluir `EMBEDDING_PROVIDER` de GitHub Actions/Cloud Build e remover Google/Vertex de `check-ai-config`, `preflight-deploy`, `bootstrap-gcp-cicd`, `fill-secrets`, `check-deploy` e ambiente local. Não revogar ainda o acesso externo ao segredo existente, pois a revisão estável precisa dele para rollback.

- [ ] **Step 3: Limpar a configuração da nova revisão Cloud Run**

Adicionar ao `gcloud run deploy`:

```bash
--remove-env-vars="LLM_PROVIDER,GOOGLE_MODEL,EMBEDDING_PROVIDER,EMBEDDING_MODEL,EMBEDDING_DIMENSION,GOOGLE_VERTEX_PROJECT,GOOGLE_VERTEX_LOCATION,EMBEDDING_VERTEX_PROJECT,EMBEDDING_VERTEX_LOCATION" \
--remove-secrets="GOOGLE_GENERATIVE_AI_API_KEY,ANTHROPIC_API_KEY,OPENAI_API_KEY" \
```

- [ ] **Step 4: Corrigir o smoke chat para o contrato atual**

Usar um UUID em `conversationId`, enviar `Accept-Language: pt-BR` e manter uma pergunta textual que obrigue o caminho FTS + Groq. O script deve reportar apenas status e resposta pública truncada, nunca segredos.

- [ ] **Step 5: Executar testes de scripts e configuração**

Run: `npm run test -- scripts/check-ai-config.test.ts scripts/deploy-cloud-run.test.ts scripts/smoke-test.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit de pipeline**

```bash
git add scripts cloudbuild.yaml cloudbuild-promote.yaml .github/workflows .env.example
git commit -m "ci: deploy Groq and PostgreSQL FTS runtime"
```

### Task 5: Copy, documentação e validação final

**Files:**
- Modify: `lib/i18n.ts`
- Modify: `README.md`
- Modify: `docs/ai-providers.md`
- Modify: `docs/ai-usage-runbook.md`
- Modify: `docs/database-migrations.md`
- Modify: `openspec/changes/use-postgres-fts-rag/tasks.md`

**Interfaces:**
- Documents: configuração de produção, arquitetura, trade-off lexical e sequência expand/promote/contract.

- [ ] **Step 1: Atualizar copy administrativa**

Usar em português: `O conteúdo é extraído, dividido em trechos e indexado pelo PostgreSQL para busca textual.`

Usar em inglês: `Content is extracted, split into chunks, and indexed by PostgreSQL for full-text search.`

- [ ] **Step 2: Atualizar documentação operacional**

Remover setup ativo de embeddings/Vertex; documentar `GROQ_API_KEY` como única credencial de IA, o RPC `search_documents`, health check FTS e a necessidade de manter os artefatos vetoriais somente até o fim do rollback.

- [ ] **Step 3: Executar validações focadas**

Run: `npm run test -- lib/rag.test.ts app/api/chat/route.test.ts app/api/ingest/route.test.ts app/api/health/route.test.ts scripts/check-ai-config.test.ts scripts/deploy-cloud-run.test.ts`

Expected: PASS.

- [ ] **Step 4: Executar validações completas**

Run: `npm run test -- --maxWorkers=1`

Run: `npm run lint`

Run: `npm run observability:local:test`

Run: `npm run build`

Expected: todos os comandos terminam com código 0.

- [ ] **Step 5: Validar artefatos e referências ativas**

Run: `openspec validate use-postgres-fts-rag --strict`

Run: `rg -n "@ai-sdk/google|google-auth-library|EMBEDDING_PROVIDER|GOOGLE_GENERATIVE_AI_API_KEY|createVertexRuntimeProvider" app lib scripts .github cloudbuild.yaml cloudbuild-promote.yaml .env.example README.md docs/ai-providers.md docs/ai-usage-runbook.md package.json`

Expected: o primeiro comando passa; o segundo não encontra referências ativas, exceto texto histórico explicitamente mantido sobre rollback/limpeza.

- [ ] **Step 6: Revisar e commitar documentação/plano**

```bash
git diff --check
git status --short
git add README.md docs lib/i18n.ts openspec/changes/use-postgres-fts-rag
git commit -m "docs: describe PostgreSQL FTS RAG rollout"
```

## Self-Review

- Cobertura: banco, aplicação, segurança, configuração, deploy, documentação, rollback e validação estão associados a tarefas verificáveis.
- Placeholders: o plano não contém `TBD`, `TODO` nem etapas abertas sem comando ou resultado esperado.
- Tipos: `retrieveContext.language` usa `'pt' | 'en'`; o RPC recebe `'portuguese' | 'english'`; o resultado SQL e `RetrievedRow` usam `rank`.
- Rollout: a contração pgvector está explicitamente fora desta entrega e só ocorre depois de 100% do tráfego na revisão FTS.
