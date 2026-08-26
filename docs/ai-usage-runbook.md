# Runbook — controle de uso de IA

Este runbook cobre o Groq para chat e o PostgreSQL Full-Text Search para recuperação. Os limites internos da aplicação são o teto operacional; alertas externos são avisos assíncronos e não interrompem consumo.

## Antes de habilitar tráfego

1. Confirme `CHAT_LLM_PROVIDER=groq` e o modelo `openai/gpt-oss-20b`.
2. Confirme que o RPC `search_documents` está disponível e que o health check retorna `{status:'ok'}`.
3. Execute `node scripts/check-ai-config.mjs` para validar a configuração sem chamar providers.
4. Execute `bash scripts/check-deploy.sh` somente quando quiser testar credenciais e o RAG implantado; esse comando faz chamadas reais.
5. Inicie `CHAT_GOVERNANCE_MODE=shadow` e promova para `enforce` após observar uma janela representativa.

## Limites e custo

O catálogo versionado em `lib/ai/pricing.ts` estima custos de geração para GPT‑OSS 20B e 120B. Os controles principais são:

- `CHAT_VISITOR_PER_MINUTE_LIMIT` e `CHAT_VISITOR_DAILY_LIMIT`;
- `CHAT_GLOBAL_DAILY_LIMIT` e `CHAT_OPERATIONAL_RESERVE_DAILY`;
- `CHAT_HISTORY_TOKEN_BUDGET`, `CHAT_RAG_TOKEN_BUDGET` e `CHAT_MAX_OUTPUT_TOKENS`;
- `CHAT_LLM_KILL_SWITCH=true` para interromper novas gerações sem derrubar FAQs determinísticas.

Revise separadamente as cotas do Groq. A recuperação textual é executada pelo PostgreSQL e não consome cota de nenhum provider externo de IA.

## Incidentes

- **Groq retorna 401/403:** rotacione `groq-api-key`, valide com `scripts/fill-secrets.sh` e gere uma nova revisão.
- **Busca textual indisponível:** o health check retorna `{status:'unavailable',reason:'dependency'}`; confirme que `search_documents` existe e que o índice GIN está íntegro.
- **429 transitório:** mantenha retries apenas antes do primeiro byte do stream e monitore a classificação registrada.
- **Consumo inesperado:** ative `CHAT_LLM_KILL_SWITCH=true`, preserve a revisão estável e investigue admissão, cache e budgets antes de reabrir.

## Rollback

O rollback deve manter Groq como provider de chat. Promova uma imagem anterior compatível ou corrija com uma nova revisão; não selecione Google, Vertex, Anthropic ou OpenAI como fallback de chat, pois esses runtimes não fazem mais parte da aplicação. Enquanto a janela de rollback estiver aberta, o schema vetorial (`documents.embedding`, índice HNSW e `match_documents`) permanece disponível para uma revisão anterior que ainda dependa dele.
