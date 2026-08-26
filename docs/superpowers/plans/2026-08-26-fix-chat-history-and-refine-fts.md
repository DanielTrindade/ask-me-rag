# Correção do histórico do chat e refinamento do FTS — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer conversas com múltiplas mensagens funcionarem com o protocolo do AI SDK 6 e aumentar a revocação da recuperação PostgreSQL FTS sem reintroduzir embeddings.

**Architecture:** A fronteira HTTP continuará rejeitando partes desconhecidas, mas reconhecerá as partes de UI emitidas pela própria aplicação (`step-start` e `data-chat-status`) antes de converter o histórico em mensagens de modelo. A recuperação ganhará um RPC expansivo `search_documents_v2`: correspondência estrita receberá bônus de precisão, enquanto uma consulta OR com expansão lexical fornecerá recall e será ranqueada por cobertura de termos e densidade FTS. O RPC antigo permanecerá disponível para rollback.

**Tech Stack:** Next.js 16, TypeScript 5, AI SDK 6, Vitest 4, PostgreSQL/Supabase Full-Text Search, pgTAP e Cloud Run.

## Global Constraints

- Responder e documentar em português do Brasil, preservando Unicode.
- Não reintroduzir modelos, APIs ou colunas de embeddings no caminho ativo.
- Preservar `search_documents(text,text,integer)` para compatibilidade com a revisão anterior.
- Manter o limite atual de corpo, mensagens, texto e tokens na fronteira HTTP.
- Rejeitar partes desconhecidas ou dados públicos malformados; aceitar somente formatos emitidos pela aplicação.
- Não realizar chamadas reais ao Groq nos testes automatizados.
- Não criar commit automaticamente; entregar alterações verificadas no worktree do usuário.

---

### Task 1: Fixar o contrato de histórico do AI SDK

**Files:**
- Modify: `lib/observability/chat-validation.test.ts`
- Modify: `app/api/chat/route.test.ts`
- Modify: `lib/observability/chat-validation.ts`

**Interfaces:**
- Consumes: `PortfolioUIMessage`, `isPublicChatStatus` e as partes `step-start`, `data-chat-status`, `data-sources` e `text` do AI SDK.
- Produces: `parseChatRequestBody(value)` aceitando um histórico real de segunda rodada sem relaxar a rejeição de partes desconhecidas.

- [ ] **Step 1: Escrever a regressão de segunda rodada na rota**

Adicionar um teste que envie o payload observado em produção:

```ts
const secondTurnMessages = [
  { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Resuma sua trajetória.' }] },
  {
    id: 'a1',
    role: 'assistant',
    parts: [
      { type: 'step-start' },
      { type: 'text', text: 'Resumo profissional.', state: 'done' },
    ],
  },
  { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'E os projetos?' }] },
];

const response = await POST(request({ conversationId, messages: secondTurnMessages }) as never);
expect(response.status).toBe(200);
expect(mocks.retrieve).toHaveBeenCalledWith('E os projetos?', expect.any(Object));
```

- [ ] **Step 2: Cobrir partes públicas de cache e partes desconhecidas**

Em `chat-validation.test.ts`, exigir aceitação de:

```ts
{ type: 'step-start' }
{ type: 'data-chat-status', id: 'public-chat-status', data: { kind: 'cache_hit', retryable: false } }
```

Manter o caso `{ type: 'future-private-part', secret: 'x' }` falhando com `unsupported_message_part` e adicionar um status público malformado falhando com `invalid_chat_status_part`.

- [ ] **Step 3: Executar a regressão e confirmar o vermelho**

Run: `npm test -- lib/observability/chat-validation.test.ts app/api/chat/route.test.ts`

Expected: FAIL com `unsupported_message_part` nos casos `step-start`/`data-chat-status`.

- [ ] **Step 4: Implementar a validação explícita das partes conhecidas**

Importar `isPublicChatStatus` e adicionar ramificações restritas:

```ts
if (part.type === 'step-start') continue;

if (part.type === 'data-chat-status') {
  const data = 'data' in part ? part.data : null;
  if (!isPublicChatStatus(data)) {
    throw new ChatValidationError('invalid_chat_status_part');
  }
  continue;
}
```

Não criar fallback genérico para prefixos `data-`.

- [ ] **Step 5: Executar os testes focados até passarem**

Run: `npm test -- lib/observability/chat-validation.test.ts app/api/chat/route.test.ts`

Expected: PASS, inclusive no payload completo da segunda rodada.

### Task 2: Criar recuperação FTS com precisão estrita e recall relaxado

**Files:**
- Create: `supabase/migrations/0009_refine_postgres_fts_rag.sql`
- Create: `supabase/tests/0009_refine_postgres_fts_rag_test.sql`
- Modify: `supabase/schema.sql`

**Interfaces:**
- Consumes: `documents.search_vector`, `unaccent`, metadados de chunks e o índice GIN criados pela migração 0008.
- Produces: `search_documents_v2(query_text text, query_expansion text, query_language text, match_count integer) returns table(id bigint, content text, metadata jsonb, rank double precision)`.

- [ ] **Step 1: Escrever o pgTAP de recall e ranking**

Criar dados em que a pergunta contém termos ausentes do mesmo chunk, uma expansão encontra o currículo e um documento com maior cobertura vence um documento com uma única correspondência. Asserções obrigatórias:

```sql
select is(
  (select metadata->>'source'
   from search_documents_v2(
     'Resuma sua trajetória e principais competências.',
     'experiência profissional carreira atuação habilidades tecnologias conhecimentos',
     'portuguese',
     3
   ) limit 1),
  'cv-daniel.md',
  'expansão lexical recupera o currículo para uma pergunta sem correspondência conjuntiva'
);

select is(
  (select count(*) from search_documents_v2('termo inexistente', '', 'portuguese', 3)),
  0::bigint,
  'consulta sem sinal lexical continua retornando vazio'
);
```

Também validar limite, idioma inglês, privilégios exclusivos de `service_role` e existência simultânea do RPC v1.

- [ ] **Step 2: Executar o teste SQL e confirmar o vermelho**

Run: `npm run observability:local:test`

Expected: FAIL porque `search_documents_v2` ainda não existe.

- [ ] **Step 3: Implementar o RPC v2 expansivo**

Construir três sinais sem interpolar SQL dinâmico vindo do usuário:

```sql
strict_query := websearch_to_tsquery(search_config, unaccent(query_text));
original_terms := tsvector_to_array(to_tsvector(search_config, unaccent(query_text)));
expanded_terms := tsvector_to_array(to_tsvector(
  search_config,
  unaccent(concat_ws(' ', query_text, nullif(query_expansion, '')))
));

select to_tsquery(
  search_config,
  string_agg(quote_literal(term), ' | ' order by term)
)
into relaxed_query
from unnest(expanded_terms) as term;
```

Filtrar com `documents.search_vector @@ relaxed_query` para usar o GIN. Calcular o ranking como soma de: bônus para a consulta estrita, cobertura dos termos originais, cobertura dos termos expandidos com peso menor e `ts_rank_cd(..., 32)`. Ordenar por `rank desc, documents.id` e limitar entre 1 e 8.

- [ ] **Step 4: Preservar permissões e compatibilidade**

```sql
revoke all on function search_documents_v2(text, text, text, integer)
  from public, anon, authenticated;
grant execute on function search_documents_v2(text, text, text, integer)
  to service_role;
```

Registrar `0009_refine_postgres_fts_rag` em `schema_migrations`, sem substituir nem remover `search_documents`.

- [ ] **Step 5: Espelhar o contrato em `supabase/schema.sql` e executar o banco local**

Run: `npm run observability:local:test`

Expected: todas as migrações, os testes pgTAP e o lint SQL passam.

### Task 3: Expandir intenções de portfólio e adotar o RPC v2

**Files:**
- Modify: `lib/rag.test.ts`
- Modify: `lib/rag.ts`
- Modify: `app/api/health/route.test.ts`
- Modify: `app/api/health/route.ts`

**Interfaces:**
- Produces: `buildRetrievalExpansion(query: string, language: 'pt' | 'en'): string`.
- Updates: `retrieveContext` chama `search_documents_v2` com `query_text`, `query_expansion`, `query_language` e `match_count`.

- [ ] **Step 1: Escrever testes da expansão determinística**

Exigir os seguintes sinais mínimos:

```ts
expect(buildRetrievalExpansion(
  'Resuma sua trajetória e principais competências.',
  'pt',
)).toContain('experiência profissional');
expect(buildRetrievalExpansion('What is your career background and skill set?', 'en'))
  .toContain('professional experience');
expect(buildRetrievalExpansion('Qual é seu LinkedIn?', 'pt')).toBe('');
```

Atualizar o teste do RPC para esperar `search_documents_v2` e o campo `query_expansion`.

- [ ] **Step 2: Confirmar a falha dos testes de aplicação**

Run: `npm test -- lib/rag.test.ts app/api/health/route.test.ts`

Expected: FAIL porque a expansão e o RPC v2 ainda não estão integrados.

- [ ] **Step 3: Implementar expansão pequena e específica do domínio**

Normalizar apenas para detecção (`NFD`, remoção de marcas combinantes e lowercase), preservar os termos Unicode enviados ao PostgreSQL e mapear grupos de intenção de português/inglês para carreira, competências/tecnologias, projetos/responsabilidades e formação. Deduplicar termos e retornar uma string limitada ao vocabulário estático.

- [ ] **Step 4: Integrar recuperação e health check ao RPC v2**

```ts
const queryExpansion = buildRetrievalExpansion(query, language);
await getServiceClient().rpc('search_documents_v2', {
  query_text: query,
  query_expansion: queryExpansion,
  query_language: language === 'en' ? 'english' : 'portuguese',
  match_count: matchCount,
});
```

O health check deve chamar `search_documents_v2` com `query_expansion: ''`, garantindo que a revisão só fique pronta quando o contrato usado pelo chat estiver disponível.

- [ ] **Step 5: Executar os testes focados até passarem**

Run: `npm test -- lib/rag.test.ts app/api/health/route.test.ts app/api/chat/route.test.ts`

Expected: PASS sem rede e sem chamada ao Groq.

### Task 4: Documentar limites e validar a entrega

**Files:**
- Modify: `docs/database-migrations.md`
- Modify: `docs/ai-providers.md`
- Modify: `docs/superpowers/plans/2026-08-26-fix-chat-history-and-refine-fts.md`

**Interfaces:**
- Documents: diferença entre recuperação lexical refinada e busca semântica vetorial, rollout da migração 0009 e compatibilidade v1/v2.

- [ ] **Step 1: Documentar o refinamento e seu limite semântico**

Registrar que o v2 melhora recall por OR, expansão de intenções e ranking por cobertura, mas não cria equivalência semântica geral: conceitos fora do vocabulário ou do texto continuam exigindo nova expansão, avaliação ou eventual busca híbrida.

- [ ] **Step 2: Executar a suíte TypeScript**

Run: `npm test -- --maxWorkers=1`

Expected: todos os testes passam.

- [ ] **Step 3: Executar verificações estáticas**

Run: `npm run lint`

Run: `npx tsc --noEmit`

Run: `git diff --check`

Expected: todos os comandos terminam com código 0.

- [ ] **Step 4: Executar validação final do banco**

Run: `npm run observability:local:test`

Expected: migrações 0000–0009, pgTAP e lint SQL passam.

## Self-Review

- Cobertura: o plano trata separadamente o bug de protocolo da segunda rodada, o recall FTS, a integração/health check e a documentação operacional.
- Segurança: partes desconhecidas continuam bloqueadas, os limites HTTP permanecem e o novo RPC conserva privilégios de `service_role`.
- Compatibilidade: a migração é expansiva e mantém o RPC v1 para rollback da revisão anterior.
- Tipos: a aplicação usa locale `'pt' | 'en'`; o RPC continua recebendo configurações PostgreSQL `'portuguese' | 'english'`.
- Limites: a solução aproxima o comportamento semântico apenas no domínio do portfólio e não afirma equivalência com embeddings.
