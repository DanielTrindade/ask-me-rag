# Runbook — controle de uso Gemini

Este runbook cobre o Google AI Studio como caminho `free-first` e o Vertex AI apenas como alternativa explícita. Os limites internos da aplicação são o hard cap operacional; alertas de Billing são avisos assíncronos e não interrompem consumo.

## 1. Confirmar a quota externa

No AI Studio, abra **Limite de taxa da API Gemini**, selecione o projeto e confira RPM, TPM e RPD para `gemini-2.5-flash-lite` e `gemini-embedding-001`.

Registre data, janela, nível e valores aprovados fora do repositório. O reset diário da quota do Gemini ocorre no fuso `America/Los_Angeles`; mantenha `CHAT_QUOTA_RESET_TIME_ZONE` coerente. Antes de mudar limites, compare os números do monitor administrativo com a quota exibida no console.

## 2. Flags operacionais

Ordem segura de rollout:

1. `CHAT_GOVERNANCE_MODE=off`: comportamento legado.
2. `CHAT_GOVERNANCE_MODE=shadow`: registra a decisão que seria aplicada, sem bloquear.
3. `CHAT_GOVERNANCE_MODE=enforce`: aplica limites, exclusão mútua e teto global.

Valores iniciais:

| Controle | Valor |
| --- | ---: |
| Por visitante/minuto | 4 |
| Por visitante/dia | 50 |
| Global/dia | 500 |
| Reserva operacional/dia | 50 |
| Lease por conversa | 60 s |

Para interromper imediatamente novas chamadas de LLM, defina `CHAT_LLM_KILL_SWITCH=true` e gere uma nova revisão. FAQs determinísticas continuam disponíveis. Não use `CHAT_GOVERNANCE_EMERGENCY_BYPASS=true` fora de uma recuperação supervisionada.

## 3. Investigar 429 e 503

1. Confira falhas por categoria e o percentual do teto diário no monitor.
2. Diferencie `rate_limited` (429 transitório) de `quota_exhausted` (quota sem retry seguro).
3. Confira RPM/TPM/RPD do modelo correto no AI Studio e o fuso do reset.
4. Para 503, separe `configuration`, `dependency`, `provider_unavailable` e `governance_unavailable` nos logs estruturados.
5. Não registre prompt, resposta, token de acesso ou credencial durante a investigação.
6. Mantenha retries pré-stream limitados; nunca repita automaticamente depois que a resposta começou.

Se o provider estiver instável, ative o kill switch antes de aumentar limites. Cache hit e FAQ determinística são degradações esperadas, não motivo para liberar o hard cap.

## 4. Ajustar teto

Altere uma dimensão por revisão e permaneça em `shadow` por uma janela representativa. Aprove os novos valores somente após comparar decisões, tokens, cache hit rate, picos de RPM, consumo diário e margem da reserva operacional.

Garanta sempre `CHAT_OPERATIONAL_RESERVE_DAILY < CHAT_GLOBAL_DAILY_LIMIT` e `CHAT_HISTORY_TOKEN_BUDGET + CHAT_RAG_TOKEN_BUDGET <= CHAT_TOTAL_INPUT_TOKEN_BUDGET`.

## 5. Billing

Crie no Google Cloud Billing budgets externos para 50%, 75%, 90% e 100% do orçamento mensal aprovado, com notificações para o canal operacional. Esses alertas podem atrasar e **não são hard cap**. O teto confiável permanece em `CHAT_GLOBAL_DAILY_LIMIT`, no kill switch e nas quotas do provider.

Registre no ambiente de produção o billing account, budget, destinatários e data da última validação sem copiar identificadores sensíveis para logs públicos.

Antes de automatizar a configuração, confirme que `billingbudgets.googleapis.com` está habilitada e que o operador possui acesso ao billing account.

Em 25/07/2026, foi criado para o projeto `ask-me-rag` um budget mensal de R$ 15,24, equivalente a US$ 3 pela PTAX de venda de 23/07/2026 (R$ 5,0807 por US$ 1). Os alertas de consumo atual foram configurados em 50%, 75%, 90% e 100%, com envio para `danieloliveiratrindade@gmail.com`. A conta de faturamento usa BRL; por isso, revise periodicamente o valor quando a referência em USD mudar. Confirme também qualquer solicitação de verificação enviada pelo Google ao destinatário.

## 6. Rollback

1. Defina `CHAT_LLM_KILL_SWITCH=true` se houver risco de consumo.
2. Volte `CHAT_GOVERNANCE_MODE` para `shadow` ou `off` conforme o incidente.
3. Desabilite caches por flags se houver suspeita de dados inválidos.
4. Direcione 100% do tráfego à última revisão Cloud Run conhecida como estável.
5. Preserve migrações aditivas; não remova tabelas/colunas durante o incidente.
6. Execute o smoke sem consumo e confirme `/api/health` antes de reabrir tráfego.

O Google AI Studio deve continuar como provider padrão durante rollback. O Vertex exige ADC e revisão sem tráfego antes de qualquer promoção.

## 7. Evidência de rollout

Para cada etapa (`off`, `shadow`, `enforce`), registre fora do repositório: revisão, início/fim da janela, limites, percentis de uso, erros, alertas verificados, aprovador e decisão. Sem essa evidência, não promova a etapa seguinte.
