## ADDED Requirements

### Requirement: Taxonomia sanitizada de falhas
O sistema SHALL classificar falhas de geração em categorias estáveis e MUST separar cota esgotada, limitação transitória, indisponibilidade, autenticação, configuração, requisição inválida, timeout, cancelamento, retrieval e erro desconhecido.

#### Scenario: Cota externa esgotada
- **WHEN** o provider retorna `429` com indicação de quota diária ou ausência de retry transitório
- **THEN** a execução recebe `quota_exhausted` e não é repetida automaticamente

#### Scenario: Falha de autenticação
- **WHEN** o provider rejeita credenciais ou permissões
- **THEN** a execução recebe `authentication_failed`, o cliente recebe mensagem genérica e nenhum detalhe da credencial é exposto

#### Scenario: Erro desconhecido
- **WHEN** a falha não corresponde a uma categoria conhecida
- **THEN** a execução recebe `unknown_provider_error` e preserva apenas metadados sanitizados

### Requirement: Repetição seletiva e limitada
O sistema SHALL repetir no máximo duas vezes apenas falhas transitórias ocorridas antes do primeiro conteúdo visível e MUST usar backoff exponencial com jitter e respeitar `Retry-After` válido.

#### Scenario: Indisponibilidade transitória
- **WHEN** o provider retorna `503` antes do primeiro delta
- **THEN** o sistema repete dentro do limite e finaliza com o resultado da primeira tentativa bem-sucedida

#### Scenario: Conteúdo parcial emitido
- **WHEN** uma falha ocorre depois de ao menos um delta enviado
- **THEN** o sistema não reinicia a geração automaticamente

#### Scenario: Erro não repetível
- **WHEN** ocorre cota diária, autenticação, configuração ou requisição inválida
- **THEN** nenhuma tentativa adicional é feita

### Requirement: Resposta degradada antes do stream
O sistema SHALL produzir uma resposta localizada e segura quando a geração for negada ou falhar antes do stream, distinguindo limitação temporária, indisponibilidade e desativação operacional.

#### Scenario: Limite diário atingido
- **WHEN** a admissão retorna limite global ou individual
- **THEN** o visitante recebe uma mensagem de limite temporário e ações públicas do perfil sem detalhes internos de quota

#### Scenario: Provider indisponível
- **WHEN** as tentativas transitórias terminam sem resposta
- **THEN** o visitante recebe uma mensagem de indisponibilidade que permite tentar novamente mais tarde

### Requirement: Preservação segura de resposta parcial
O sistema SHALL preservar texto efetivamente entregue antes de uma falha ou cancelamento e MUST marcá-lo como parcial sem concatenar fallback como se fosse conteúdo do modelo.

#### Scenario: Falha durante streaming
- **WHEN** o stream falha depois de enviar texto
- **THEN** a UI mantém o texto, exibe indicação localizada de interrupção e a telemetria registra status parcial

#### Scenario: Cancelamento pelo visitante
- **WHEN** o visitante cancela a resposta
- **THEN** a execução termina como `aborted`, libera o lease e não inicia retry

### Requirement: Experiência de retry controlada pelo usuário
O cliente SHALL bloquear submissões concorrentes na mesma conversa e SHALL permitir nova tentativa explícita quando a categoria pública autorizar retry.

#### Scenario: Geração em andamento
- **WHEN** existe uma resposta ativa
- **THEN** o controle de envio permanece desabilitado ou enfileiramento é recusado de forma visível

#### Scenario: Retry permitido
- **WHEN** a resposta termina com indisponibilidade transitória
- **THEN** a UI oferece ação de tentar novamente que preserva o mesmo identificador lógico conforme a política de idempotência

### Requirement: Logs operacionais sem conteúdo sensível
O sistema MUST registrar somente request ID, provider, modelo, status, categoria, retryability, tentativa e duração, e MUST NOT registrar prompt, contexto RAG, response body bruto, chave, token, IP ou cookie.

#### Scenario: Provider retorna corpo detalhado
- **WHEN** a resposta de erro contém conteúdo da requisição ou identificadores internos
- **THEN** esses dados são usados apenas em memória para classificação e não aparecem em logs ou respostas públicas

#### Scenario: Falha do classificador
- **WHEN** a própria classificação lança erro
- **THEN** o sistema registra `unknown_provider_error` com metadados mínimos
