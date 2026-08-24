# Migração do chat para Groq — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o chat RAG funcional com Groq e `openai/gpt-oss-20b`, mantendo temporariamente os embeddings Google de 1.536 dimensões e o PostgreSQL/Supabase atuais.

**Architecture:** A geração de texto passa a ter Groq como único provider suportado pelo runtime de chat, sem alterar o protocolo de streaming do AI SDK nem a recuperação RAG. Embeddings continuam independentes porque a API Groq não oferece embeddings; a remoção do Google e a migração do acesso Supabase para PostgreSQL direto serão mudanças posteriores e isoladas.

**Tech Stack:** Next.js 16, TypeScript 5, AI SDK 6, `@ai-sdk/groq` 3.x, Groq GPT-OSS 20B, Vitest, Cloud Run e Secret Manager.

## Status em 24/08/2026

A fase 1, **Chat Groq funcional**, foi implementada e verificada. O acompanhamento executável está concluído em `openspec/changes/migrate-chat-to-groq/tasks.md`: runtime, health check, telemetria, segredos, deploy, CI e documentação usam Groq para chat, enquanto embeddings permanecem Google/Vertex com 1.536 dimensões.

Verificações concluídas: 237 testes aprovados, 12 testes Bash ignorados no Windows, lint sem erros e build de produção concluído com placeholders, sem chamadas reais a providers. Para executar o RAG localmente, ainda é necessário preencher `GROQ_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` no `.env.local`.

## Global Constraints

- Responder e documentar em português do Brasil, preservando Unicode.
- Manter `gemini-embedding-001` com dimensão fixa de 1.536 nesta entrega; trocar embeddings exige reingestão completa.
- Não alterar schema, dados ou acesso Supabase/PostgreSQL nesta entrega.
- Não realizar chamadas faturáveis nos testes automatizados nem no health check.
- Nunca registrar ou retornar `GROQ_API_KEY`, prompts internos, contexto RAG, IPs ou respostas brutas de erro.
- Preservar streaming, fontes, cancelamento, respostas parciais e degradação segura existentes.

---

## Roadmap de simplificação

Esta entrega é a primeira de mudanças independentes, cada uma com seu próprio OpenSpec e ciclo de testes:

1. **Chat Groq funcional:** usar `openai/gpt-oss-20b`, configurar segredo e manter embeddings atuais.
2. **Acesso PostgreSQL portátil:** substituir `@supabase/supabase-js` por `DATABASE_URL` e SQL explícito ainda contra o banco Supabase.
3. **Banco enxuto:** criar uma baseline PostgreSQL + pgvector, normalizar os campos de chunks e migrar somente os dados necessários.
4. **Remoção de overengineering:** eliminar providers antigos, governança/caches/precificação e observabilidade persistente que não tiverem uso comprovado.
5. **Embeddings open-weight, opcional:** avaliar um modelo multilíngue separado e reingerir a base somente se a remoção do Google justificar o custo operacional.

## Estrutura de arquivos desta entrega

- `lib/llm.ts`: resolve exclusivamente o modelo de chat Groq e valida sua credencial.
- `lib/llm.test.ts`: especifica default, override e erros de configuração do runtime Groq.
- `lib/ai/runtime-contracts.ts`: restringe `ChatProvider` a `groq`, preservando o contrato consumido pela rota.
- `lib/ai/pricing.ts`: registra os preços versionados dos modelos GPT-OSS usados pela telemetria ainda existente.
- `lib/ai/pricing.test.ts`: valida lookup e cálculo de custo Groq.
- `app/api/health/route.test.ts`: garante validação do segredo Groq sem chamada externa.
- `scripts/check-ai-config.mjs`: valida `groq` como único provider de chat no preflight.
- `scripts/check-ai-config.test.ts`: cobre default Groq e provider inválido.
- `scripts/deploy-cloud-run.sh`: injeta `GROQ_API_KEY` pelo Secret Manager.
- `scripts/bootstrap-gcp-cicd.sh`, `scripts/fill-secrets.sh`, `scripts/preflight-deploy.sh`, `scripts/check-deploy.sh`: criam, validam e verificam `groq-api-key` sem expor seu valor.
- `.env.example`, `README.md`, `docs/ai-providers.md`: documentam o setup Groq e deixam explícita a dependência temporária de embeddings Google.
- `package.json`, `package-lock.json`: adicionam o adapter Groq compatível com AI SDK 6 e removem adapters de chat sem uso quando seguro.

### Task 1: Especificar o runtime Groq

**Files:**
- Modify: `lib/llm.test.ts`
- Modify: `lib/ai/runtime-contracts.ts`
- Modify: `lib/llm.ts`
- Test: `lib/llm.test.ts`

**Interfaces:**
- Consumes: `AiRuntimeConfigurationError` e `ChatRuntime` existentes.
- Produces: `DEFAULT_GROQ_CHAT_MODEL = 'openai/gpt-oss-20b'` e `resolveChatRuntime(env): ChatRuntime` com `provider: 'groq'`.

- [ ] **Step 1: Escrever testes que exijam Groq como default**

```ts
const groqEnv = { NODE_ENV: 'test', GROQ_API_KEY: 'groq-placeholder' };

expect(resolveChatRuntime(groqEnv)).toMatchObject({
  role: 'chat',
  provider: 'groq',
  modelId: 'openai/gpt-oss-20b',
  capabilities: { streaming: true, thinkingControl: true },
});
```

- [ ] **Step 2: Cobrir override, provider inválido e segredo ausente**

```ts
expect(resolveChatRuntime({ ...groqEnv, CHAT_LLM_MODEL: 'openai/gpt-oss-120b' }).modelId)
  .toBe('openai/gpt-oss-120b');
expect(() => resolveChatRuntime({ ...groqEnv, CHAT_LLM_PROVIDER: 'google' }))
  .toThrow(AiRuntimeConfigurationError);
expect(() => resolveChatRuntime({ GROQ_API_KEY: '' }))
  .toThrow(AiRuntimeConfigurationError);
```

- [ ] **Step 3: Executar o teste e confirmar a falha esperada**

Run: `npm test -- lib/llm.test.ts`

Expected: FAIL porque o runtime atual ainda seleciona Google e outros providers.

- [ ] **Step 4: Implementar o runtime mínimo Groq**

```ts
import { groq } from '@ai-sdk/groq';

export const DEFAULT_GROQ_CHAT_MODEL = 'openai/gpt-oss-20b';

export function resolveChatRuntime(env: EnvSource = process.env): ChatRuntime {
  const provider = (env.CHAT_LLM_PROVIDER ?? env.LLM_PROVIDER ?? 'groq').trim().toLowerCase();
  if (provider !== 'groq') throw new AiRuntimeConfigurationError('chat', 'CHAT_LLM_PROVIDER');
  requiredValue(env, 'GROQ_API_KEY', 'chat');
  const modelId = env.CHAT_LLM_MODEL?.trim() || env.GROQ_MODEL?.trim() || DEFAULT_GROQ_CHAT_MODEL;
  return {
    role: 'chat',
    provider: 'groq',
    modelId,
    displayName: modelId,
    model: groq(modelId),
    providerOptions: { groq: { reasoningEffort: 'low', reasoningFormat: 'hidden' } },
    capabilities: { streaming: true, thinkingControl: true },
  };
}
```

- [ ] **Step 5: Executar o teste e confirmar sucesso**

Run: `npm test -- lib/llm.test.ts`

Expected: PASS.

### Task 2: Integrar dependência, health check e custo

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `app/api/health/route.test.ts`
- Modify: `lib/ai/pricing.ts`
- Modify: `lib/ai/pricing.test.ts`

**Interfaces:**
- Consumes: runtime Groq da Task 1.
- Produces: adapter `@ai-sdk/groq` 3.x instalado e preços GPT-OSS reconhecidos pela telemetria.

- [ ] **Step 1: Instalar o adapter compatível com Provider V3**

Run: `npm install @ai-sdk/groq@^3.0.60`

Expected: `@ai-sdk/provider` permanece na linha 3.x compatível com `ai@6`.

- [ ] **Step 2: Atualizar testes de health check**

```ts
vi.stubEnv('CHAT_LLM_PROVIDER', 'groq');
vi.stubEnv('GROQ_API_KEY', 'groq-placeholder');
```

Adicionar um caso que esvazie `GROQ_API_KEY` e espere `{ status: 'unavailable', reason: 'configuration' }` sem acessar o banco.

- [ ] **Step 3: Escrever testes de preço Groq**

```ts
expect(lookupModelPrice('groq', 'openai/gpt-oss-20b')).toMatchObject({
  inputUsdPerMillionTokens: 0.075,
  outputUsdPerMillionTokens: 0.30,
});
```

- [ ] **Step 4: Registrar GPT-OSS 20B e 120B no catálogo versionado**

Usar `effectiveFrom: '2026-08-24'`, com preços oficiais por milhão de tokens:

- `openai/gpt-oss-20b`: entrada `0.075`, saída `0.30`.
- `openai/gpt-oss-120b`: entrada `0.15`, saída `0.60`.

- [ ] **Step 5: Rodar os testes focados**

Run: `npm test -- lib/llm.test.ts lib/ai/pricing.test.ts app/api/health/route.test.ts`

Expected: PASS sem rede e sem chamadas a providers.

### Task 3: Atualizar validação e deploy

**Files:**
- Modify: `scripts/check-ai-config.mjs`
- Modify: `scripts/check-ai-config.test.ts`
- Modify: `scripts/deploy-cloud-run.sh`
- Modify: `scripts/deploy-cloud-run.test.ts`
- Modify: `scripts/bootstrap-gcp-cicd.sh`
- Modify: `scripts/fill-secrets.sh`
- Modify: `scripts/preflight-deploy.sh`
- Modify: `scripts/check-deploy.sh`
- Modify: `cloudbuild.yaml`
- Modify: `cloudbuild-promote.yaml`

**Interfaces:**
- Consumes: `GROQ_API_KEY`, Secret Manager `groq-api-key` e `CHAT_LLM_PROVIDER=groq`.
- Produces: deploy reproduzível que vincula o segredo ao Cloud Run e preflight que falha quando ele não existe.

- [ ] **Step 1: Fazer os testes de scripts esperarem Groq**

```ts
CHAT_LLM_PROVIDER: 'groq',
```

Atualizar asserções de deploy para conter `CHAT_LLM_PROVIDER=groq` e `GROQ_API_KEY=groq-api-key:latest`.

- [ ] **Step 2: Confirmar que os testes falham com os defaults antigos**

Run: `npm test -- scripts/check-ai-config.test.ts scripts/deploy-cloud-run.test.ts`

Expected: FAIL mencionando o provider/default ou a ausência do segredo Groq.

- [ ] **Step 3: Restringir a validação de chat a Groq**

```js
const chatProvider = value('CHAT_LLM_PROVIDER', value('LLM_PROVIDER', 'groq')).toLowerCase();
oneOf('CHAT_LLM_PROVIDER', chatProvider, ['groq']);
```

Manter a validação independente de embeddings Google/Vertex.

- [ ] **Step 4: Provisionar e vincular o segredo**

Adicionar `groq-api-key` às listas de criação, permissão, preflight e preenchimento. No deploy:

```bash
--update-secrets="GROQ_API_KEY=groq-api-key:latest,..."
```

Validar a chave apenas por resposta HTTP da API de modelos, sem imprimir seu conteúdo.

- [ ] **Step 5: Tornar Groq o default dos builds**

Definir `_CHAT_LLM_PROVIDER: groq` em `cloudbuild.yaml` e `cloudbuild-promote.yaml`.

- [ ] **Step 6: Rodar os testes dos scripts**

Run: `npm test -- scripts/check-ai-config.test.ts scripts/deploy-cloud-run.test.ts`

Expected: PASS.

### Task 4: Atualizar configuração e documentação

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/ai-providers.md`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: nomes de variáveis e modelos definidos nas Tasks 1–3.
- Produces: setup local e CI coerentes com Groq chat + Google embeddings.

- [ ] **Step 1: Atualizar o ambiente de exemplo**

```dotenv
CHAT_LLM_PROVIDER=groq
CHAT_LLM_MODEL=openai/gpt-oss-20b
GROQ_API_KEY=

EMBEDDING_PROVIDER=google
EMBEDDING_MODEL=gemini-embedding-001
EMBEDDING_DIMENSION=1536
GOOGLE_GENERATIVE_AI_API_KEY=
```

- [ ] **Step 2: Atualizar a documentação operacional**

Explicar que Groq gera a resposta, Google gera os embeddings e ambos os segredos são necessários para o RAG completo nesta fase. Documentar `openai/gpt-oss-120b` apenas como override de qualidade.

- [ ] **Step 3: Atualizar placeholders do CI**

Adicionar `GROQ_API_KEY: ci-placeholder` e definir `CHAT_LLM_PROVIDER: groq`, preservando a chave Google placeholder para validação de embeddings.

- [ ] **Step 4: Verificar referências obsoletas**

Run: `rg -n "CHAT_LLM_PROVIDER=google|Claude|Anthropic|OPENAI_API_KEY|Google AI Studio.*chat" README.md .env.example docs/ai-providers.md scripts cloudbuild*.yaml`

Expected: nenhuma instrução ativa indicar Google/Claude/OpenAI como provider de chat suportado.

### Task 5: Verificação integral e handoff

**Files:**
- Modify: `openspec/changes/migrate-chat-to-groq/tasks.md`
- Verify: todo o repositório

**Interfaces:**
- Consumes: todas as mudanças anteriores.
- Produces: integração verificável sem depender de uma chamada Groq real nos testes automatizados.

- [ ] **Step 1: Executar testes focados**

Run: `npm test -- lib/llm.test.ts lib/ai/pricing.test.ts app/api/health/route.test.ts scripts/check-ai-config.test.ts scripts/deploy-cloud-run.test.ts`

Expected: PASS.

- [ ] **Step 2: Executar a suíte completa**

Run: `npm test`

Expected: PASS.

- [ ] **Step 3: Executar lint**

Run: `npm run lint`

Expected: exit code 0.

- [ ] **Step 4: Executar build de produção**

Run: `npm run build`

Expected: build Next.js concluído sem erro de tipo ou configuração.

- [ ] **Step 5: Verificar configuração local sem revelar valores**

Confirmar apenas a presença de `GROQ_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`. Se algum estiver ausente, registrar o comando/configuração necessária no handoff, sem criar ou imprimir segredo.

- [ ] **Step 6: Marcar as tarefas OpenSpec concluídas**

Atualizar cada checkbox imediatamente após sua verificação e executar `openspec status --change "migrate-chat-to-groq"`.

## Critérios de aceite

- `resolveChatRuntime()` retorna Groq GPT-OSS 20B por padrão.
- Configuração sem `GROQ_API_KEY` falha antes de qualquer chamada externa.
- O streaming existente recebe um modelo AI SDK Provider V3 compatível.
- Health check, CI e deploy reconhecem Groq como provider de chat.
- Cloud Run recebe `GROQ_API_KEY` do Secret Manager.
- Embeddings continuam Google/Vertex e nunca são apresentados como fornecidos pela Groq.
- Nenhum teste automatizado realiza chamada real de IA.
- Testes, lint e build passam.

## Sequência posterior

Após validar o chat Groq em produção, criar uma nova mudança OpenSpec para `decouple-supabase-postgres`. Ela deverá introduzir `DATABASE_URL` e SQL explícito contra o banco atual antes de qualquer migração de dados ou remoção das tabelas existentes.
