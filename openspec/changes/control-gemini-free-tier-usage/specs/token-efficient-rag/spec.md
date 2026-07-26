## ADDED Requirements

### Requirement: Orçamento total determinístico de entrada
O sistema SHALL aplicar um orçamento configurável de entrada antes de chamar o modelo e MUST preservar a instrução de sistema e a pergunta atual.

#### Scenario: Entrada dentro do orçamento
- **WHEN** sistema, pergunta, contexto e histórico cabem no limite
- **THEN** o prompt é enviado sem remoções

#### Scenario: Entrada excede o orçamento
- **WHEN** a composição supera o limite configurado
- **THEN** o sistema reduz contexto e histórico de maneira determinística antes de chamar o modelo

### Requirement: Janela limitada de histórico
O sistema SHALL selecionar os turnos anteriores mais recentes até o orçamento de histórico e MUST remover turnos antigos em pares coerentes sem usar outro LLM para sumarização.

#### Scenario: Conversa longa
- **WHEN** o histórico acumulado excede o orçamento
- **THEN** os turnos completos mais antigos são excluídos do prompt e a pergunta atual permanece

#### Scenario: Mensagem individual excessiva
- **WHEN** uma mensagem ultrapassa o limite de validação
- **THEN** a requisição é rejeitada antes de reserva e geração

### Requirement: Contexto RAG limitado por relevância
O sistema SHALL ordenar chunks por relevância, limitar a quantidade inicial a três e respeitar um orçamento configurável de contexto.

#### Scenario: Três chunks cabem no orçamento
- **WHEN** os três resultados mais relevantes cabem no limite
- **THEN** todos são incluídos com suas referências de fonte

#### Scenario: Chunk ultrapassa o restante do orçamento
- **WHEN** um chunk faria o contexto exceder o teto
- **THEN** ele é truncado em fronteira segura ou omitido sem remover as fontes dos chunks efetivamente usados

### Requirement: Limite explícito de saída
O sistema SHALL definir `maxOutputTokens` para toda geração pública e SHALL registrar quando a resposta terminar por limite de comprimento.

#### Scenario: Resposta objetiva
- **WHEN** o modelo conclui antes do limite
- **THEN** o stream termina normalmente com o uso real registrado

#### Scenario: Limite de saída alcançado
- **WHEN** o provider encerra a resposta por comprimento
- **THEN** a UI mantém o texto e a telemetria registra o motivo sem retry automático

### Requirement: Cache exato de respostas elegíveis
O sistema SHALL reutilizar somente respostas completas de primeiro turno cuja chave corresponda a pergunta normalizada, locale, provider/modelo, revisão de prompt e revisão de conhecimento.

#### Scenario: Cache hit válido
- **WHEN** uma pergunta de primeiro turno possui entrada não expirada com todas as revisões correspondentes
- **THEN** a resposta e fontes são servidas sem nova reserva de LLM

#### Scenario: Conversa com histórico
- **WHEN** a pergunta depende de turnos anteriores
- **THEN** o cache compartilhado de respostas não é consultado nem preenchido

#### Scenario: Resposta parcial ou falha
- **WHEN** a geração é abortada, falha ou termina parcial
- **THEN** nenhum valor é gravado no cache de respostas

### Requirement: Invalidação lógica por revisão de conhecimento
O sistema SHALL incrementar uma revisão monotônica após ingestão ou exclusão bem-sucedida de documentos e MUST incluir essa revisão na chave de resposta.

#### Scenario: Documento ingerido
- **WHEN** novos chunks são efetivamente persistidos
- **THEN** a revisão é incrementada e respostas de revisões anteriores deixam de ser hits

#### Scenario: Upload sem conteúdo novo
- **WHEN** a deduplicação não insere nem remove documentos
- **THEN** a revisão permanece inalterada

### Requirement: Cache de embeddings compatível com o modelo
O sistema SHALL indexar embeddings de consulta por hash normalizado, provider, modelo, dimensão e finalidade e MUST NOT reutilizar vetor incompatível.

#### Scenario: Consulta idêntica
- **WHEN** existe vetor não expirado com a mesma configuração
- **THEN** o retrieval reutiliza o vetor sem chamar o provider de embedding

#### Scenario: Modelo ou dimensão alterada
- **WHEN** qualquer identificador de compatibilidade diverge
- **THEN** o sistema gera novo embedding e mantém isolada a entrada antiga

### Requirement: Cache minimizado e expirável
O sistema MUST armazenar apenas dados necessários ao reuso, SHALL aplicar TTL configurável e MUST proteger tabelas de cache contra acesso de clientes anônimos.

#### Scenario: Entrada expirada
- **WHEN** o TTL de resposta ou embedding é alcançado
- **THEN** a entrada não é usada e pode ser removida por limpeza idempotente

#### Scenario: Consulta armazenada
- **WHEN** um embedding é cacheado
- **THEN** somente o hash e metadados de compatibilidade acompanham o vetor, sem texto bruto da pergunta
