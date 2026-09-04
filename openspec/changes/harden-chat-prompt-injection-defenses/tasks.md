## 1. Guarda de injeção determinístico

- [x] 1.1 Criar `lib/ai/injection-guard.ts` com `inspectForPromptInjection(question)` e regras por famílias (âncora de formatação en/pt, ponte de competência en/pt com verbo de ação, moldura de carreira "como Daniel resolveria") e resultado `allowed | blocked`.
- [x] 1.2 Criar `lib/ai/injection-guard.test.ts` cobrindo os payloads F1/F2/F3 do relatório, variações em pt/en e perguntas legítimas de carreira (sem falso positivo).

## 2. Verificador de fundamentação

- [x] 2.1 Criar `lib/ai/groundedness.ts` com `verifyGroundedness({ question, context, answer, runtime })`, política `GROUNDEDNESS_POLICY`, `Output.choice(['grounded','ungrounded'])`, `temperature: 0`, timeout 5s e retorno de uso.
- [x] 2.2 Criar `lib/ai/groundedness.test.ts` cobrindo contrato da chamada, política e falha fechada (mock de `generateText` rejeitando).

## 3. Endurecimento de prompts

- [x] 3.1 Adicionar seção `INSTRUCTION HIERARCHY` e proibições de âncoras de formatação/pontes em `buildSystemPrompt` (`lib/rag.ts`).
- [x] 3.2 Adicionar exemplos de âncoras de formatação e pontes de competência como `out_of_scope` em `PORTFOLIO_SCOPE_POLICY` (`lib/ai/scope-guard.ts`).
- [x] 3.3 Atualizar `lib/rag.test.ts` e `lib/ai/scope-guard.test.ts` para as novas regras de prompt.

## 4. Configuração e cache

- [x] 4.1 Adicionar `groundedness.enabled` (`CHAT_GROUNDEDNESS_ENABLED`) e `injectionGuard.enabled` (`CHAT_INJECTION_GUARD_ENABLED`) a `parseChatUsageConfig` e defaults.
- [x] 4.2 Atualizar `lib/ai/governance-config.test.ts` e documentar as variáveis no `.env.example`.
- [x] 4.3 Incrementar `CHAT_PROMPT_REVISION` em `lib/ai/cache.ts` e atualizar `lib/ai/cache.test.ts` e o mock da rota.

## 5. Retry para geração em buffer

- [x] 5.1 Adicionar `wrapGenerate` a `createPreStreamRetryMiddleware` (`lib/ai/resilience.ts`) reaproveitando classificação de falhas e backoff.
- [x] 5.2 Atualizar `lib/ai/resilience.test.ts` cobrindo o novo `wrapGenerate`.

## 6. Rota e status neutro

- [x] 6.1 Em `app/api/chat/route.ts`, executar o guarda de injeção após o FAQ/cache e antes da admissão; bloqueio responde recusa `out_of_scope` via `createCachedChatResponse` sem status e com `recordImmediateTelemetry`.
- [x] 6.2 Substituir a geração `streamText` por `generateText` (buffer) com `temperature: 0`, retry via `wrapGenerate`, verificador de fundamentação e substituição por recusa quando `ungrounded`/falha.
- [x] 6.3 Remover o part `data-chat-status` das respostas determinísticas (FAQ, falta de evidência, fora de escopo) e manter `cache_hit` explícito no hit de cache; ajustar `lib/ai/cached-chat-response.ts` para emitir status apenas quando fornecido.
- [x] 6.4 Atualizar `app/api/chat/route.test.ts` para o novo fluxo (guarda, `generateText`, verificador, telemetria agregada com 3 tentativas, recusas sem status).

## 7. Smoke e verificação final

- [x] 7.1 Atualizar `scripts/smoke-ai-governance.sh` e `scripts/smoke-ai-governance.test.ts` para verificar o texto da resposta FAQ em vez do marcador `deterministic_fallback`.
- [x] 7.2 Rodar `npm test`, `npm run lint` e `npm run build` com sucesso.

## 8. Correções da revisão

- [x] 8.1 Telemetria: `providerAttempts` conta chamadas reais (classificador, tentativa inicial, cada retry, verificador quando executado); remover ordinais fixos e a sobrescrita de retries; cobrir 2/3/4/5 na rota.
- [x] 8.2 Migração `0010_chat_provider_attempts_up_to_5.sql` (constraint e `finish_chat_request_v2` aceitando 0..5), atualizar `supabase/schema.sql` e adicionar pgTAP `0010_chat_provider_attempts_test.sql`.
- [x] 8.3 Guarda: corrigir regex duplicado `(resposta|resposta)`; adicionar padrões en/pt "Answer/Respond with X" e "Responda com X", inclusive sem determinante, preservando expressões legítimas de modo; documentar risco residual.
- [x] 8.4 Smoke: usar frase realmente reconhecida pela FAQ ("Como posso entrar em contato com você?") e detectar divergência entre payload e FAQ no teste.
- [x] 8.5 Groundedness: política explícita de `QUESTION`/`RETRIEVED_SOURCES`/`ANSWER` como dados não confiáveis; teste unitário de falha do `generateText` (fail-closed).
- [x] 8.6 FAQ de contato: resposta com links Markdown reais a partir de `NEXT_PUBLIC_GITHUB_URL`/`LINKEDIN_URL`/`RESUME_URL` com fallback para GitHub; testes.
- [x] 8.7 Documentação: README (geração em buffer + entrega SSE pós-verificação) e runbook (ordem FAQ/cache → guarda → admissão → RAG → … e tentativas coerentes).
- [x] 8.8 Relatório: correções sem inventar evidência (versão do AI SDK, ausência de autenticação/Origin, F5 como decisão de produto, taxas sem transcrição bruta, temperature 0, justificativa da severidade).
- [x] 8.9 Coerência OpenSpec: eliminar linguagem de "garantia" absoluta; descrever redução de risco/fail-closed; corrigir redação ("deterministicamente", "alta precisão"); registrar migração e teto 0..5; manter `[x]` somente em tarefas validadas.
