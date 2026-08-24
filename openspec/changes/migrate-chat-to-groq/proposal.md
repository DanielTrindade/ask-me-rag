## Why

O chat RAG não possui hoje uma integração de IA configurada e, por isso, não consegue executar o fluxo de produção. A primeira etapa da simplificação arquitetural deve estabelecer um único provider de geração funcional e econômico antes de alterar banco, embeddings ou observabilidade.

## What Changes

- Tornar Groq o único provider suportado pelo runtime de chat nesta entrega.
- Usar `openai/gpt-oss-20b` como modelo padrão e permitir override explícito por configuração.
- Integrar o adapter oficial `@ai-sdk/groq` compatível com AI SDK 6, preservando o streaming existente.
- Validar `GROQ_API_KEY` no runtime, health check e preflight sem realizar chamada faturável.
- Provisionar e vincular `groq-api-key` pelo Secret Manager no deploy do Cloud Run.
- Registrar preços de GPT-OSS 20B/120B na telemetria atual enquanto esse mecanismo existir.
- Atualizar ambiente, CI e documentação para deixar explícito que Groq gera respostas, enquanto Google continua temporariamente responsável pelos embeddings de 1.536 dimensões.
- **BREAKING**: configurações de chat `google`, `vertex`, `anthropic` e `openai` deixam de ser aceitas; `CHAT_LLM_PROVIDER` passa a aceitar somente `groq`.

## Capabilities

### New Capabilities

- `groq-chat-generation`: Geração de respostas RAG por streaming com Groq GPT-OSS, validação segura de configuração e integração reproduzível de deploy.

### Modified Capabilities

Nenhuma. Não há specs principais registradas em `openspec/specs/`.

## Impact

- Runtime de chat e seus testes em `lib/llm.ts`, `lib/ai/runtime-contracts.ts` e health check.
- Dependências npm dos providers de IA.
- Validação, bootstrap, segredos e scripts de deploy do Cloud Run.
- Catálogo de preço usado pela observabilidade existente.
- `.env.example`, CI, README e documentação de providers.
- Nenhuma alteração no protocolo HTTP/UI do chat, no schema PostgreSQL, nos dados, na recuperação pgvector ou no contrato atual de embeddings.
