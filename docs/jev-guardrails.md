# Guardrails graduados com TypeSafe/Jev

Operação dos guardrails descritos em `docs/plans/2026-09-23-jev-graded-guardrails-design.md`. O objetivo é recusar menos perguntas legítimas sem afrouxar a detecção de burla: o Jev devolve probabilidades calibradas, a política em código (`lib/ai/jev/policy.ts`) as converte em ações graduadas e o caminho Groq atual continua como piso.

## Estágios

| Estágio | Módulo | Estado enviado ao Jev | Efeito quando ativo |
|---|---|---|---|
| A+B entrada e escopo | `lib/ai/jev/input-guard.ts` | pergunta + 2 turnos recentes | `pass`/`soften`/`limited` dispensam o classificador Groq; `refuse` recusa; `fallback` chama o classificador |
| C trechos do RAG | `lib/ai/jev/passage-guard.ts` | trechos recuperados | trechos com instruções embutidas (≥ 0,70) saem do contexto |
| D fundamentação | `lib/ai/jev/groundedness.ts` | pergunta, fontes, resposta | `pass` entrega; `limited` entrega com ressalva; `refuse` recusa; `fallback` chama o verificador Groq |

Ações: `refuse` > `fallback` > `limited` > `soften` > `pass`.

- `soften`: a geração recebe uma diretiva para ignorar a âncora de formatação e responder a pergunta de portfólio.
- `limited`: a geração responde só a parte profissional e a rota acrescenta uma ressalva determinística no idioma da pergunta (`chat.scope.limitedScope` / `chat.scope.partialEvidence`, pt-BR e inglês).
- Com o estágio A ativo, **o Jev substitui a camada heurística**: a regex (`lib/ai/injection-guard.ts`) não veta nem impõe piso, só aparece no log como sinal `regex:<padrão>` para comparar regex × Jev. Ela volta a decidir (modo degradado) apenas se o Jev ficar indisponível.
- Com o estágio A ativo, o prompt de geração entra no modo `graded` (`buildSystemPrompt(..., { graded: true })`): sai a lista de padrões proibidos do red team e passa a ser permitido conectar e comparar fatos documentados (ex.: "como backend e frontend se complementam"). Completar lacunas com conhecimento geral continua proibido.
- Ative o estágio D junto com o A: a síntese permitida pelo modo `graded` tende a ser reprovada pelo verificador Groq estrito, enquanto o Jev D gradua o suporte.
- Falha, timeout (orçamento de 2,5 s, uma tentativa extra) ou falta de chave: sempre o caminho atual. Nenhum estágio pode derrubar a rota.

## Idiomas

O Jev é mais preciso em inglês. As instruções das perguntas são em inglês, com exemplos em pt-BR e inglês nos critérios, e o estado vai no idioma do visitante. Antes de ativar um estágio, compare os sinais do modo sombra por idioma (`resolveQuestionLocale`), e rode a avaliação live nos dois idiomas:

```bash
RUN_LIVE_JEV_EVAL=1 TYPESAFE_API_KEY=... npx vitest run lib/ai/jev/guardrails.live.test.ts
```

## Rollout

1. Criar o secret com `bash scripts/fill-secrets.sh` (a chave é validada contra a API) e conceder acesso à service account de runtime:
   `gcloud secrets add-iam-policy-binding typesafe-api-key --member=serviceAccount:ask-me-rag-sa@ask-me-rag.iam.gserviceaccount.com --role=roles/secretmanager.secretAccessor`.
2. No GitHub (Settings → Environments/Variables), criar a variável `TYPESAFE_API_KEY_SECRET=typesafe-api-key`. O CI (`ci.yml`) e a promoção (`deploy.yml`) repassam para `_TYPESAFE_API_KEY_SECRET` (vazio = sem vínculo, tudo desligado).
3. Modo sombra: `gcloud run services update ask-me-rag --update-env-vars=CHAT_JEV_SHADOW=true`. Os três estágios rodam e registram, sem mudar respostas.
4. Calibrar `JEV_THRESHOLDS` com os logs e subir `JEV_POLICY_VERSION` a cada mudança.
5. Critério para ativar: no teste live e na sombra, as 8 sugestões do chat (pt-BR e inglês) dão `pass`, e os ataques F1–F3 continuam recusados **só pelo Jev** (sem a regex).
6. Ativar desligando a sombra: `CHAT_JEV_GUARD_ENABLED=true` e `CHAT_JEV_GROUNDEDNESS_ENABLED=true` juntos; por fim `CHAT_JEV_PASSAGE_GUARD_ENABLED=true`.

Rollback: voltar a flag para `false` (sem deploy). A revisão do cache muda com a combinação de estágios ativos (`resolvePromptRevision`), então respostas de uma política não são servidas pela outra.

Lembrete: env vars do Cloud Run ficam fixadas na revisão e sobrepõem os defaults do código.

## Telemetria

Cada estágio emite uma linha `[chat-guard]` em JSON (Cloud Logging) com `policyVersion`, `requestId`, `stage`, `mode`, `action`, sinais (probabilidade/valor, `confidence` quando houver), modelo, tokens de entrada, custo estimado (US$ 0,042/Mtok) e duração. Nenhum conteúdo da conversa entra no log.

Consulta sugerida:

```text
resource.type="cloud_run_revision" textPayload:"[chat-guard]"
```

A persistência em `chat_requests.guard_signals` (migração `0011`) fica para depois do período de sombra.

## Privacidade

Com a chave configurada, a pergunta, dois turnos recentes, os trechos recuperados e a resposta passam a ser enviados à TypeSafe (mesma classe de exposição do Groq). A TypeSafe não treina com dados de clientes; retenção zero só no plano enterprise. Atualize a política de privacidade do site antes de ativar em produção.
