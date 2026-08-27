# Runbook — controle de uso de IA

Este runbook cobre o Groq para chat e o PostgreSQL Full-Text Search para recuperação. Os limites internos da aplicação são o teto operacional; alertas externos são avisos assíncronos e não interrompem consumo.

## Fluxo de uma pergunta

O fluxo final é `FAQ determinística` ou `cache válido`; em cache miss, `admissão → RAG → evidência → classificador → geração`.

- **Escopo permitido:** exclusivamente a trajetória profissional de Daniel — experiências, cargos, responsabilidades, projetos, entregas, resultados, competências, ferramentas, tecnologias, decisões técnicas, formação, certificações, modo de trabalho e links profissionais. Uma pergunta sobre tecnologia só é permitida quando pergunta pela relação dela com a carreira (ex.: “Você já usou Dijkstra em algum projeto?”).
- **Solicitações mistas:** qualquer pedido que misture uma tarefa fora do domínio é recusado integralmente, mesmo que contenha parte profissional.
- **Sem evidência:** se o RAG não devolver contexto com ao menos uma fonte identificada, a pergunta recebe a recusa determinística de fontes sem nenhuma chamada ao provider.
- **Pergunta aprovada com evidência:** uma chamada curta de classificação (saída estruturada, `maxOutputTokens=16`, temperatura 0, timeout 5 s) e uma chamada de geração em streaming.
- **Fora do escopo com correspondência acidental no FTS:** uma chamada curta de classificação e nenhuma geração; a resposta é a recusa determinística de escopo.
- **Falha do classificador:** erro, timeout ou saída inválida fecha em `503 temporarily_unavailable` e nunca chega ao gerador. O mesmo vale para falha do RAG.
- Tokens, tentativas e custo registrados na telemetria incluem a chamada de classificação.

## Avaliação real do classificador de escopo

A matriz opt-in em `lib/ai/scope-guard.live.test.ts` mede a decisão do modelo Groq real para 8 casos. Ela fica ignorada sem autorização explícita e nunca roda em CI sem credencial. Para executar:

```powershell
$env:RUN_LIVE_SCOPE_EVAL='1'
npm test -- lib/ai/scope-guard.live.test.ts
Remove-Item Env:RUN_LIVE_SCOPE_EVAL
```

A execução faz oito classificações reais e consome quota do Groq; rode apenas quando for intencional.

## Política e cache

Toda alteração futura na política de escopo, no prompt de geração ou na evidência obrigatória deve incrementar `CHAT_PROMPT_REVISION` em `lib/ai/cache.ts` (atual: `portfolio-chat-v2-grounded`). A revisão participa da chave de cache e torna respostas produzidas sob a política anterior inalcançáveis; os registros antigos expiram pelo TTL natural.

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
