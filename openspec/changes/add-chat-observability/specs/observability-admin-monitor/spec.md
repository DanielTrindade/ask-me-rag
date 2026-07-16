## ADDED Requirements

### Requirement: Acesso administrativo protegido
O sistema MUST exigir uma sessão administrativa válida em todas as páginas e APIs de observabilidade, inclusive quando a proteção de proxy não for executada.

#### Scenario: Administrador autenticado
- **WHEN** uma sessão administrativa válida solicita o monitor
- **THEN** o sistema permite acesso aos dados conforme a operação solicitada

#### Scenario: Requisição sem sessão
- **WHEN** uma página ou API de observabilidade é acessada sem sessão válida
- **THEN** a página redireciona ao login ou a API responde `401` sem retornar telemetria

### Requirement: Resumo operacional por período
O monitor SHALL apresentar indicadores do período selecionado para conversas, mensagens, execuções, estados finais, latência, tokens, dispositivos e navegadores.

#### Scenario: Período com dados
- **WHEN** o administrador abre o monitor ou altera o período
- **THEN** os indicadores são recalculados somente com dados dentro do intervalo autorizado

#### Scenario: Métrica indisponível
- **WHEN** o provedor não informa tokens ou outro campo opcional
- **THEN** o monitor identifica a métrica como indisponível e não a contabiliza como zero

### Requirement: Lista paginada e filtrável de conversas
O monitor SHALL listar conversas recentes por paginação baseada em cursor e SHALL aceitar filtros por período, estado, dispositivo, navegador, bot e IP exato processado no servidor.

#### Scenario: Paginação estável
- **WHEN** o administrador solicita a próxima página
- **THEN** o sistema usa cursor determinístico e não duplica registros entre páginas mesmo com novas conversas chegando

#### Scenario: Filtro por IP
- **WHEN** o administrador informa um IP válido no filtro
- **THEN** a API calcula seu HMAC no servidor e retorna conversas correspondentes sem consultar por IP em texto

#### Scenario: Filtro inválido
- **WHEN** um filtro tem formato, tamanho ou intervalo inválido
- **THEN** a API responde `400` sem executar uma consulta irrestrita

### Requirement: Inspeção cronológica da conversa
O monitor SHALL exibir as mensagens de uma conversa em ordem cronológica junto dos estados e métricas de suas execuções, sem mostrar dados internos do RAG ou prompts.

#### Scenario: Conversa existente
- **WHEN** o administrador abre uma conversa autorizada
- **THEN** o monitor apresenta perguntas, respostas, horários, dispositivo resumido, IP mascarado e métricas disponíveis

#### Scenario: Conversa removida ou expirada
- **WHEN** a conversa já não existe
- **THEN** a API responde `404` sem indicar outros identificadores ou dados relacionados

### Requirement: Mascaramento e revelação explícita do IP
O monitor SHALL mostrar o IP mascarado por padrão e MUST exigir uma ação explícita, autenticada e auditada para retornar o IP completo descriptografado.

#### Scenario: Listagem padrão
- **WHEN** o administrador visualiza resumo, lista ou detalhe inicial
- **THEN** nenhum IP completo é incluído no HTML ou JSON retornado

#### Scenario: Revelação autorizada
- **WHEN** o administrador confirma a revelação em uma requisição de mesma origem
- **THEN** a API descriptografa somente o IP solicitado, retorna-o sem cache e registra a ação de auditoria

#### Scenario: IP expirado
- **WHEN** o período de retenção do IP completo já terminou
- **THEN** o monitor informa que o valor não está mais disponível e não tenta reconstruí-lo a partir do hash

### Requirement: Busca textual administrativa
O monitor SHALL permitir busca textual explícita e paginada sobre mensagens ainda retidas, com limites de tamanho e resultados.

#### Scenario: Busca válida
- **WHEN** o administrador envia um termo dentro dos limites
- **THEN** o sistema retorna somente conversas retidas que contenham o termo e respeita a paginação

#### Scenario: Busca vazia ou excessiva
- **WHEN** o termo é vazio ou excede o tamanho permitido
- **THEN** a API responde `400` e não executa varredura ampla

### Requirement: Exclusão administrativa de conversa
O monitor SHALL permitir excluir uma conversa específica com confirmação, proteção de mesma origem e auditoria da ação.

#### Scenario: Exclusão confirmada
- **WHEN** o administrador confirma a exclusão de uma conversa existente
- **THEN** mensagens e execuções relacionadas são removidas em cascata e a auditoria registra somente o identificador e a ação

#### Scenario: Exclusão repetida
- **WHEN** a mesma conversa é excluída novamente
- **THEN** a operação não revela dados anteriores e retorna um resultado idempotente apropriado

### Requirement: Integridade da retenção visível
O monitor SHALL informar a última execução bem-sucedida da rotina de retenção e SHALL sinalizar quando ela estiver atrasada.

#### Scenario: Retenção em dia
- **WHEN** a limpeza ocorreu dentro da janela diária esperada
- **THEN** o monitor apresenta estado saudável e o horário da última execução

#### Scenario: Retenção atrasada
- **WHEN** não existe execução bem-sucedida dentro da janela configurada
- **THEN** o monitor apresenta alerta administrativo sem expor credenciais ou detalhes internos do job

