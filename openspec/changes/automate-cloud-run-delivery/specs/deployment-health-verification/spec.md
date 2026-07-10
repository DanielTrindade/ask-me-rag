## ADDED Requirements

### Requirement: Endpoint de saúde informa prontidão sem consumir LLM
A aplicação MUST expor `GET /api/health` para validar a prontidão do processo, da configuração obrigatória e do Supabase sem chamar modelos de linguagem ou gerar embeddings.

#### Scenario: Aplicação pronta
- **WHEN** a configuração obrigatória está presente e a consulta mínima ao Supabase responde dentro do timeout
- **THEN** o endpoint retorna HTTP 200 com um corpo não sensível indicando prontidão

#### Scenario: Dependência indisponível
- **WHEN** a consulta mínima ao Supabase falha ou excede o timeout
- **THEN** o endpoint retorna HTTP 503 sem incluir segredo, conexão ou detalhe interno sensível

#### Scenario: Configuração obrigatória ausente
- **WHEN** uma variável indispensável à operação não está configurada
- **THEN** o endpoint retorna HTTP 503 e identifica apenas a categoria da falha

### Requirement: Respostas de saúde não são armazenadas em cache
O endpoint de saúde MUST impedir cache intermediário ou no cliente para que cada verificação represente o estado atual da revisão.

#### Scenario: Consulta de saúde
- **WHEN** qualquer cliente chama o endpoint
- **THEN** a resposta inclui diretivas `no-store`

### Requirement: Smoke test aplica timeout e repetição limitada
O verificador de deploy MUST usar timeout por requisição e um número limitado de tentativas com backoff antes de declarar a revisão indisponível.

#### Scenario: Inicialização transitória
- **WHEN** as primeiras chamadas falham durante o cold start e uma chamada posterior passa dentro do limite
- **THEN** o smoke test é aprovado

#### Scenario: Falha persistente
- **WHEN** todas as tentativas falham ou excedem o timeout
- **THEN** o smoke test falha com diagnóstico que não contém dados sensíveis

