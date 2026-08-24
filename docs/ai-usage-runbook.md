# Runbook — controle de uso de IA

Este runbook cobre Groq para chat e Google AI Studio ou Vertex AI para embeddings. Os limites internos da aplicação são o teto operacional; alertas externos são avisos assíncronos e não interrompem consumo.

## Antes de habilitar tráfego

1. Confirme `CHAT_LLM_PROVIDER=groq` e o modelo `openai/gpt-oss-20b`.
2. Confirme `EMBEDDING_PROVIDER=google` ou `vertex`, mantendo `gemini-embedding-001` e 1536 dimensões.
3. Execute `node scripts/check-ai-config.mjs` para validar a configuração sem chamar providers.
4. Execute `bash scripts/check-deploy.sh` somente quando quiser testar credenciais e o RAG implantado; esse comando faz chamadas reais.
5. Inicie `CHAT_GOVERNANCE_MODE=shadow` e promova para `enforce` após observar uma janela representativa.

## Limites e custo

O catálogo versionado em `lib/ai/pricing.ts` estima custos de geração para GPT‑OSS 20B e 120B. Os controles principais são:

- `CHAT_VISITOR_PER_MINUTE_LIMIT` e `CHAT_VISITOR_DAILY_LIMIT`;
- `CHAT_GLOBAL_DAILY_LIMIT` e `CHAT_OPERATIONAL_RESERVE_DAILY`;
- `CHAT_HISTORY_TOKEN_BUDGET`, `CHAT_RAG_TOKEN_BUDGET` e `CHAT_MAX_OUTPUT_TOKENS`;
- `CHAT_LLM_KILL_SWITCH=true` para interromper novas gerações sem derrubar FAQs determinísticas.

Revise separadamente as cotas do Groq e do Google AI Studio. Embeddings de consulta e de ingestão consomem a cota Google; a resposta final consome a cota Groq.

## Incidentes

- **Groq retorna 401/403:** rotacione `groq-api-key`, valide com `scripts/fill-secrets.sh` e gere uma nova revisão.
- **Google retorna 401/403:** rotacione `google-generative-ai-api-key`; o chat não conclui o RAG sem o embedding da pergunta.
- **429 transitório:** mantenha retries apenas antes do primeiro byte do stream e monitore a classificação registrada.
- **Consumo inesperado:** ative `CHAT_LLM_KILL_SWITCH=true`, preserve a revisão estável e investigue admissão, cache e budgets antes de reabrir.
- **Falha no Vertex:** confirme ADC, projeto/localização e `roles/aiplatform.user`; não introduza chave JSON como atalho.

## Rollback

O rollback deve manter Groq como provider de chat. Promova uma imagem anterior compatível ou corrija com uma nova revisão; não selecione Google, Vertex, Anthropic ou OpenAI como fallback de chat, pois esses runtimes não fazem mais parte da aplicação.
