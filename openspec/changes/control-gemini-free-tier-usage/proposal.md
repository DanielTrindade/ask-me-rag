## Why

O chat público depende de uma cota gratuita compartilhada do Gemini, mas hoje não distingue esgotamento de cota de outras falhas, não limita o consumo por visitante nem impõe um teto global de uso. Isso permite que histórico crescente, respostas longas, repetição de requisições ou abuso esgotem a franquia sem diagnóstico claro e deixem o portfólio indisponível.

## What Changes

- Tornar `gemini-2.5-flash-lite` o modelo Google padrão para reduzir consumo e custo, mantendo seleção configurável de modelo e provider.
- Classificar falhas do provider sem expor segredos, distinguindo cota esgotada, limitação transitória, indisponibilidade, autenticação, configuração e cancelamento.
- Proteger o chat com limites persistentes por visitante, limite global diário, exclusão mútua por conversa, idempotência e kill switch operacional.
- Aplicar orçamentos explícitos ao histórico, ao contexto RAG e à saída do modelo para impedir crescimento de tokens sem controle.
- Implementar repetição seletiva com backoff, resposta degradada quando o LLM estiver indisponível e experiência específica para cota esgotada.
- Registrar tokens, custo estimado, bloqueios e categorias de falha; apresentar essas métricas no monitor administrativo existente.
- Reutilizar resultados seguros por meio de cache versionado de respostas frequentes e embeddings de consultas idênticas.
- Separar configuração e contratos de chat e embeddings, permitindo introduzir Vertex AI com Application Default Credentials como opção futura sem alterar o fluxo da aplicação.
- Adicionar migrações, testes automatizados, documentação operacional e controles de rollout necessários para implantar a proteção de consumo com segurança.

## Capabilities

### New Capabilities

- `chat-usage-governance`: Limites por visitante e globais, controle de concorrência, idempotência e desligamento operacional do uso de LLM.
- `resilient-chat-generation`: Classificação de erros, repetição seletiva, mensagens seguras ao visitante e funcionamento degradado quando o provider não puder responder.
- `token-efficient-rag`: Orçamentos de tokens para histórico, contexto recuperado e saída, além de cache seguro e invalidável para reduzir chamadas repetidas.
- `llm-usage-monitoring`: Captura e visualização administrativa de tokens, custo estimado, consumo diário, bloqueios e falhas por provider/modelo.
- `ai-provider-configuration`: Configuração independente de chat e embeddings e contratos que permitam selecionar Google AI Studio ou Vertex AI sem acoplar as rotas aos SDKs.

### Modified Capabilities

Nenhuma. Não há specs principais arquivadas em `openspec/specs/`; as capacidades relacionadas à observabilidade permanecem em uma mudança ainda ativa e serão integradas por dependências de implementação, sem redefinir seus requisitos nesta proposta.

## Impact

- Rotas e UI de chat: `app/api/chat/route.ts`, `components/chat/*` e validação de mensagens.
- Seleção de modelos e RAG: `lib/llm.ts`, `lib/embeddings.ts`, `lib/rag.ts` e novos contratos/adapters de IA.
- Observabilidade administrativa: armazenamento, resumo, endpoints e componentes em `lib/observability/*`, `app/api/admin/observability/*` e `components/admin/*`.
- Banco Supabase: novas estruturas/RPCs para contadores persistentes, idempotência, cache e agregação de uso, seguindo migrações expand/contract.
- Configuração e operação: `.env.example`, health check, documentação, Secret Manager e parâmetros de deploy do Cloud Run.
- Testes: cobertura unitária, integração das rotas, concorrência dos contadores, comportamento do stream e smoke tests de produção.
- Dependências: pode exigir o provider oficial `@ai-sdk/google-vertex` apenas quando o adapter Vertex for ativado; o caminho Google AI Studio continua sendo o padrão free-first.
