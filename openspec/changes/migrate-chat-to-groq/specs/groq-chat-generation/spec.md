## ADDED Requirements

### Requirement: Groq é o runtime de geração do chat
O sistema SHALL usar Groq como único provider de geração aceito e SHALL usar `openai/gpt-oss-20b` quando nenhum modelo explícito for configurado.

#### Scenario: Runtime padrão
- **WHEN** `GROQ_API_KEY` está presente e nenhuma sobrescrita de modelo é informada
- **THEN** o runtime resolve provider `groq` e modelo `openai/gpt-oss-20b`

#### Scenario: Override de modelo
- **WHEN** `CHAT_LLM_MODEL` contém um ID Groq não vazio
- **THEN** o runtime usa esse ID sem alterar o provider

#### Scenario: Provider legado rejeitado
- **WHEN** `CHAT_LLM_PROVIDER` seleciona `google`, `vertex`, `anthropic`, `openai` ou outro valor diferente de `groq`
- **THEN** o sistema falha com categoria sanitizada de configuração antes de chamar banco ou IA

### Requirement: Credencial Groq é obrigatória e secreta
O sistema MUST exigir `GROQ_API_KEY` para o runtime de chat e MUST obter esse valor de configuração server-side, sem expô-lo em logs, respostas, imagem ou variáveis públicas.

#### Scenario: Credencial ausente
- **WHEN** `GROQ_API_KEY` está ausente ou vazia
- **THEN** o health check retorna indisponibilidade por configuração sem realizar chamada externa

#### Scenario: Deploy no Cloud Run
- **WHEN** uma revisão candidata é implantada
- **THEN** `GROQ_API_KEY` é vinculada ao segredo `groq-api-key:latest` acessível somente pela identidade de runtime autorizada

### Requirement: Streaming RAG existente é preservado
O sistema SHALL fornecer o modelo Groq ao fluxo `streamText` existente e MUST preservar fontes, cancelamento, texto parcial, limite de saída e tratamento seguro de falhas.

#### Scenario: Geração concluída
- **WHEN** recuperação RAG e geração Groq terminam com sucesso
- **THEN** o cliente recebe a resposta pelo mesmo protocolo de UI stream e as fontes recuperadas continuam disponíveis

#### Scenario: Limite da Groq
- **WHEN** a Groq retorna `429` antes do primeiro delta
- **THEN** o sistema aplica a política de retry existente e, se esgotada, retorna uma resposta degradada sanitizada

#### Scenario: Falha após conteúdo visível
- **WHEN** o provider falha depois de emitir texto
- **THEN** o sistema preserva o conteúdo parcial e não reinicia automaticamente a geração

### Requirement: Embeddings permanecem independentes
O sistema MUST manter `gemini-embedding-001` com 1.536 dimensões nesta entrega e SHALL informar na configuração que uma credencial Google continua necessária para o RAG completo.

#### Scenario: Consulta RAG com Groq
- **WHEN** uma pergunta é processada com chat Groq e embeddings Google
- **THEN** a pergunta é vetorizada pelo provider de embeddings atual, recupera chunks no pgvector e somente a geração final usa Groq

#### Scenario: Dimensão incompatível
- **WHEN** `EMBEDDING_DIMENSION` difere de `1536`
- **THEN** o sistema rejeita a configuração antes de consultar pgvector

### Requirement: Verificações automatizadas não consomem IA
Os testes automatizados, o build e o health check MUST validar configuração e contratos sem enviar prompts à Groq ou ao provider de embeddings.

#### Scenario: Suíte de CI
- **WHEN** testes, lint e build são executados com credenciais placeholder
- **THEN** as verificações concluem sem chamadas faturáveis e sem depender de conectividade com providers de IA
