## Context

O endpoint público de chat executa, em sequência, validação, recuperação RAG, seleção de provider e `streamText`. O provider Google é o padrão, o embedding Gemini é obrigatório mesmo quando o chat usa Anthropic/OpenAI, o histórico recebido do navegador pode chegar a 50 mensagens/40 mil caracteres e não existe controle de frequência no `/api/chat`. A telemetria já persiste provider, modelo e tokens quando disponíveis, mas erros de SDK são reduzidos a categorias genéricas e o resumo administrativo não estima custo nem mostra bloqueios de consumo.

A aplicação roda em Cloud Run e pode ter múltiplas instâncias efêmeras. Portanto, contadores em memória não garantem limites diários, idempotência nem exclusão mútua global. O Supabase já é a fonte persistente compartilhada e possui funções transacionais acessíveis apenas por `service_role`, sendo o local natural para reservas de consumo e agregações.

O objetivo operacional é free-first: manter Google AI Studio/Gemini Developer API como caminho padrão, reduzir o consumo previsível e degradar de maneira útil quando a cota externa ou interna acabar. Vertex AI será suportado como adapter configurável, mas não será necessário para ativar esta mudança.

## Goals / Non-Goals

**Goals:**

- Impedir que um visitante, conversa ou rajada de tráfego consuma toda a franquia disponível.
- Aplicar um teto diário global antes de qualquer chamada que consuma embedding ou geração.
- Tornar falhas de quota e provider diagnosticáveis sem vazar prompts, respostas internas, IPs ou credenciais.
- Reduzir tokens repetidos por histórico, RAG, saída e chamadas idênticas.
- Manter streaming, cancelamento, telemetria e experiência bilíngue existentes.
- Permitir seleção independente dos providers/modelos de chat e embedding.
- Disponibilizar consumo e custo estimado no monitor administrativo.
- Implantar de forma reversível, com migrações aditivas e flags de rollout.

**Non-Goals:**

- Automatizar `gemini.google.com`, reutilizar perfil Chromium ou reaproveitar OAuth pessoal do Gemini CLI.
- Garantir disponibilidade ilimitada quando toda a cota externa estiver esgotada.
- Criar cobrança, assinatura ou autenticação de visitantes.
- Substituir o Supabase pgvector, alterar a dimensão atual de 1536 ou reingerir documentos nesta entrega.
- Implementar sumarização de histórico por LLM, busca semântica aproximada no cache ou roteamento automático entre providers pagos.
- Transformar alertas de Billing do Google Cloud em hard cap; o hard cap pertence à aplicação.

## Decisions

### 1. Separar admissão, execução e contabilização

O fluxo será dividido em três fases: `reserve`, `execute` e `finalize`. Antes de embedding/RAG, a rota chama uma RPC transacional de admissão com `requestId`, `conversationId`, `messageId`, HMAC do visitante e limites configurados. A RPC retorna `allowed`, `duplicate`, `visitor_limited`, `global_limited`, `conversation_busy` ou `disabled`.

A reserva aceita uma única execução lógica por `(conversation_id, message_id)`, incrementa atomicamente os contadores autorizados e cria um lease curto da conversa. A finalização registra resultado, tokens e libera o lease de forma idempotente. Leases expirados podem ser recuperados depois do timeout máximo da rota.

Alternativas consideradas:

- Somente limiter em memória: rejeitado porque Cloud Run escala horizontalmente e reinicia instâncias.
- Contar apenas depois da resposta: rejeitado porque concorrência permitiria ultrapassar o teto.
- Usar exclusivamente a telemetria existente: rejeitado porque ela pode ser desabilitada; governança de custo deve continuar obrigatória.

### 2. Persistir governança em tabelas mínimas e protegidas

Uma migração aditiva criará estruturas equivalentes a:

- `chat_usage_buckets`: contadores por janela, escopo (`global`/`visitor`) e chave protegida.
- `chat_generation_reservations`: idempotência, lease, decisão de admissão e estado terminal.
- `chat_response_cache`: resposta elegível por hash, locale, revisão de conhecimento/prompt/modelo e expiração.
- `chat_embedding_cache`: vetor por hash, provider, modelo, dimensão e expiração.
- `chat_knowledge_revision`: revisão monotônica incrementada após mutações bem-sucedidas da base documental.

Todas as tabelas terão RLS habilitada, nenhum acesso de `anon`/`authenticated` e RPCs concedidas somente a `service_role`. Identificadores de visitante usarão o HMAC já derivado para observabilidade; IP bruto ou criptografado não será duplicado nessas tabelas.

O dia interno do provider Google será calculado em `America/Los_Angeles`, alinhado ao reset de RPD. A zona será configurável para outros providers, e timestamps continuarão armazenados em UTC.

### 3. Falhar fechado apenas na proteção de custo

Se a reserva persistente não puder confirmar que há orçamento, a rota não chamará embedding nem LLM e retornará degradação segura. A telemetria administrativa, por outro lado, continuará best-effort: falha ao registrar métricas após uma reserva válida não derrubará uma resposta já em andamento.

Essa decisão privilegia previsibilidade financeira sobre disponibilidade total. Um bypass emergencial só poderá ser ativado por configuração explícita e documentada; não haverá fallback silencioso para limiter local.

### 4. Usar taxonomia sanitizada de erros

Um classificador isolado converterá erros do AI SDK/provider em:

- `quota_exhausted`
- `rate_limited`
- `provider_unavailable`
- `authentication_failed`
- `configuration_error`
- `invalid_provider_request`
- `timeout`
- `aborted`
- `retrieval_failed`
- `unknown_provider_error`

O classificador poderá consultar `statusCode`, `isRetryable`, `Retry-After` e detalhes estruturados conhecidos, mas retornará apenas categoria, retryability, tempo seguro de repetição e código HTTP público. Response body bruto, stack, prompt e credenciais não serão enviados ao cliente nem persistidos.

### 5. Repetir somente antes de qualquer conteúdo visível

Serão permitidas no máximo duas novas tentativas com backoff exponencial e jitter para `503`, timeout de conexão e `429` explicitamente transitório. `quota_exhausted`, autenticação e requisição inválida não serão repetidos. Depois do primeiro delta enviado ao visitante, o sistema nunca reiniciará automaticamente a geração, evitando texto duplicado e cobrança duplicada.

Alternativa considerada: confiar integralmente no retry padrão do SDK. Rejeitada porque um `429` diário pode ser marcado como retryable sem distinguir RPD esgotado de uma rajada curta.

### 6. Aplicar um orçamento único de prompt

Um `PromptBudget` central comporá o prompt nesta ordem:

1. instrução de sistema fixa;
2. pergunta atual, sempre preservada;
3. contexto RAG ordenado por similaridade;
4. turnos anteriores mais recentes, preservando pares completos.

Valores iniciais configuráveis:

- modelo Google padrão: `gemini-2.5-flash-lite`;
- histórico: 4.000 tokens estimados;
- RAG: 2.000 tokens estimados e três chunks;
- saída: 500 tokens;
- limite total de entrada: 8.000 tokens estimados.

A estimativa será determinística e conservadora; a medição real retornada pelo provider permanece a fonte para telemetria. O sistema não chamará outro LLM para resumir histórico.

### 7. Cachear apenas casos seguros e versionados

O cache de resposta será exato, não semântico, e só poderá atender conversas de primeiro turno sem contexto personalizado. A chave incluirá hash da pergunta normalizada, locale, provider/modelo, revisão do prompt e revisão da base documental. O valor terá TTL, texto final, fontes públicas e metadados mínimos. Aborts, erros, respostas parciais e conteúdo com ferramentas não serão cacheados.

O cache de embeddings armazenará apenas hash da entrada normalizada e vetor, identificado por provider, modelo, dimensão e finalidade (`query`/`document`). Uma mudança nesses campos causa miss natural. Mutações de documentos incrementam a revisão de conhecimento e invalidam logicamente respostas antigas sem exclusão síncrona.

### 8. Tratar degradação como resultado conhecido

Quando admissão negar consumo ou o provider falhar antes do stream, a API retornará uma mensagem localizada e estruturada, com uma categoria pública (`temporarily_limited`, `temporarily_unavailable` ou `disabled`) e ações públicas do perfil. Se existir resposta exata válida no cache, ela poderá ser usada antes de consumir uma nova reserva de LLM.

Se a falha ocorrer após texto parcial, a UI preservará o conteúdo recebido, marcará a resposta como parcial e exibirá uma nota localizada; nenhuma resposta estática será concatenada como se fosse saída do modelo.

### 9. Estimar custo por tabela versionada

Custos serão calculados fora do caminho crítico a partir de tokens reais e uma tabela de preços configurada/versionada por provider e modelo. A ausência de preço ou tokens produzirá custo `null`, nunca zero. O monitor exibirá claramente valores estimados, moeda USD e versão/data do preço.

Bloqueios antes do provider serão contabilizados separadamente e não receberão tokens/custo. O resumo reutilizará a observabilidade existente, estendendo-a com categorias de erro, cache hit, decisão de governança e custo estimado.

### 10. Introduzir contratos de provider sem reescrever o streaming

Um resolvedor server-only retornará um runtime com `chatModel`, `embeddingModel`, nomes públicos, opções do provider e capacidades. Google AI Studio, Anthropic e OpenAI serão adaptados ao contrato; Vertex usará o provider oficial e ADC quando selecionado. As rotas continuarão consumindo tipos do Vercel AI SDK, preservando `streamText`, `embed` e `embedMany`.

Chat e embeddings terão variáveis independentes. A seleção inválida falhará no startup/health check sem chamada faturável. O adapter Vertex não aceitará arquivo de perfil, OAuth pessoal nem chave de service account embutida; em Cloud Run usará a service account anexada.

## Risks / Trade-offs

- [Contadores persistentes adicionam uma chamada ao banco por chat] → Usar RPC única e índices estreitos; medir p95 e manter a reserva antes do trabalho caro.
- [Falha do Supabase bloqueia o chat] → Retornar degradação explícita, monitorar a categoria e permitir bypass emergencial somente por configuração auditável.
- [Estimativa local de tokens diverge do tokenizer do provider] → Usar margem conservadora e comparar estimado versus uso real no monitor.
- [Retry pode duplicar custo] → Repetir apenas antes do primeiro delta e limitar a duas tentativas.
- [Cache pode servir conteúdo obsoleto] → Incluir revisão de conhecimento, prompt, locale e modelo na chave, além de TTL.
- [HMAC ausente impede limite por IP] → Aplicar limite por conversa e global; em produção, configuração criptográfica inválida bloqueia admissão até correção.
- [Múltiplas mudanças OpenSpec alteram as mesmas áreas de observabilidade] → Implementar depois de integrar ou reconciliar `add-chat-observability`, preservando suas garantias de minimização e retenção.
- [Budget alert não interrompe faturamento] → Hard cap permanece na RPC de admissão e no kill switch.
- [Vertex amplia dependências e IAM] → Mantê-lo atrás de configuração e validar separadamente; Google AI Studio continua padrão.

## Migration Plan

1. Concluir ou reconciliar as tarefas pendentes de `add-chat-observability` que tocam schema, store e monitor administrativo.
2. Adicionar migrações expand-only, RLS, RPCs e testes pgTAP sem ativar bloqueio em produção.
3. Implantar classificador de erros, runtime de providers e telemetria adicional com flags desabilitadas.
4. Trocar o default para Flash-Lite e ativar apenas os orçamentos de histórico/RAG/saída.
5. Ativar governança em modo sombra, calculando decisões sem bloquear, e comparar contadores com tráfego real.
6. Definir limites a partir das quotas visíveis no AI Studio; ativar limite por visitante, concorrência e teto global gradualmente.
7. Ativar degradação, cache e painel de custo; executar smoke de cache miss/hit, 429, 503, abort e limite diário.
8. Habilitar Vertex somente em ambiente de teste, com ADC e permissões mínimas, antes de oferecê-lo como configuração de produção.

Rollback: desabilitar cache e enforcement por flags, restaurar o modelo anterior e manter tabelas/colunas aditivas. Não remover migrações durante rollback. O kill switch deve continuar funcional independentemente do rollout.

## Open Questions

- Quais RPM, TPM e RPD estão efetivamente atribuídos ao projeto no AI Studio no momento da implementação?
- Qual percentual da cota diária será reservado para testes administrativos e ingestões?
- O limite por visitante deve usar apenas IP protegido ou combinar IP e conversa para reduzir impacto de NAT compartilhado?
- Qual TTL inicial será adotado para resposta e embedding cache após medir repetição real?
- O adapter Vertex entra na primeira implementação ou apenas os contratos e testes de compatibilidade serão entregues inicialmente?
