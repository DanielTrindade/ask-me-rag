## ADDED Requirements

### Requirement: Configuração independente de chat e embeddings
O sistema SHALL selecionar provider e modelo de chat separadamente do provider e modelo de embeddings e MUST validar cada combinação antes de atender tráfego.

#### Scenario: Google em ambos os papéis
- **WHEN** chat e embeddings estão configurados para Google AI Studio
- **THEN** cada operação usa seu modelo específico com a credencial server-side correspondente

#### Scenario: Chat alternativo com embedding Google
- **WHEN** o chat usa provider diferente e embeddings permanecem Google
- **THEN** retrieval e geração usam configurações independentes sem exigir chave do provider de chat para embedding

### Requirement: Flash-Lite como padrão free-first
O sistema SHALL usar `gemini-2.5-flash-lite` como modelo Google de chat quando nenhuma configuração explícita for fornecida e SHALL permitir override validado.

#### Scenario: Modelo ausente
- **WHEN** o provider Google é selecionado sem nome de modelo
- **THEN** o runtime resolve `gemini-2.5-flash-lite`

#### Scenario: Override explícito
- **WHEN** um modelo Google suportado é configurado
- **THEN** o runtime usa o valor e a telemetria registra o nome efetivo

### Requirement: Contrato único de runtime de IA
O sistema SHALL expor às rotas contratos server-only para chat e embeddings, incluindo modelo, metadados públicos, opções e capacidades, e MUST ocultar detalhes de construção dos SDKs.

#### Scenario: Rota solicita modelo de chat
- **WHEN** `/api/chat` resolve o runtime configurado
- **THEN** recebe um `LanguageModel` compatível e metadados sem importar diretamente todos os providers

#### Scenario: RAG solicita embedding
- **WHEN** ingestão ou retrieval resolve o runtime de embedding
- **THEN** recebe modelo compatível, dimensão e finalidade sem depender do provider de chat

### Requirement: Adapter Vertex com ADC
O sistema SHALL suportar Vertex AI como opção configurável usando Application Default Credentials e MUST NOT depender de perfil Chromium, OAuth pessoal do Gemini CLI ou chave de service account embutida.

#### Scenario: Cloud Run autorizado
- **WHEN** Vertex está selecionado e a service account anexada possui permissões mínimas
- **THEN** o adapter autentica por ADC e executa chat/embedding no projeto e localização configurados

#### Scenario: ADC indisponível
- **WHEN** Vertex está selecionado sem credencial ou permissão válida
- **THEN** health/configuração falha de forma sanitizada antes de expor o serviço como pronto

### Requirement: Compatibilidade vetorial preservada
O runtime de embeddings SHALL declarar dimensão 1536 para a base atual e MUST impedir uso de vetor com dimensão diferente sem migração explícita.

#### Scenario: Gemini embedding configurado
- **WHEN** `gemini-embedding-001` é resolvido para Google ou Vertex
- **THEN** a chamada solicita 1536 dimensões e o vetor é compatível com o schema existente

#### Scenario: Modelo incompatível
- **WHEN** um provider/modelo não suporta 1536 dimensões
- **THEN** a configuração é rejeitada antes de ingestão ou consulta ao pgvector

### Requirement: Health check sem chamada faturável
O endpoint de saúde SHALL validar presença, formato e coerência da configuração selecionada sem gerar texto ou embedding faturável.

#### Scenario: Configuração válida
- **WHEN** providers, modelos e requisitos locais estão coerentes
- **THEN** o health check pode declarar a aplicação pronta sem chamar modelo

#### Scenario: Configuração inválida
- **WHEN** provider desconhecido, modelo ausente ou dimensão incompatível é detectado
- **THEN** o health check retorna categoria sanitizada e não chama serviço generativo

### Requirement: Falhas isoladas por papel
O sistema SHALL atribuir falhas ao papel `chat` ou `embedding` e SHALL permitir diagnóstico independente de cada dependência.

#### Scenario: Embedding indisponível
- **WHEN** o provider de embedding falha antes da recuperação
- **THEN** a execução recebe `retrieval_failed` com metadados do embedding e não inicia o chat model

#### Scenario: Chat indisponível após retrieval
- **WHEN** o embedding e o banco funcionam, mas a geração falha
- **THEN** a execução registra falha do provider de chat sem classificar o retrieval como indisponível
