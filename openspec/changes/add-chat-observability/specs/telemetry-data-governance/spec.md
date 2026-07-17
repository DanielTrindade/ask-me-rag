## ADDED Requirements

### Requirement: Transparência antes da coleta
A interface pública SHALL informar, antes do primeiro envio, que perguntas, respostas e dados técnicos básicos serão registrados para segurança, suporte e melhoria, incluindo acesso aos prazos de retenção.

#### Scenario: Primeiro acesso ao chat
- **WHEN** um visitante visualiza o compositor antes de enviar uma mensagem
- **THEN** o aviso e o acesso aos detalhes de tratamento estão disponíveis sem depender da autenticação administrativa

#### Scenario: Alteração da política
- **WHEN** os dados coletados, finalidades ou prazos forem alterados
- **THEN** o texto público correspondente MUST ser atualizado antes de habilitar a nova coleta

### Requirement: Minimização por padrão
O sistema MUST coletar somente campos definidos na especificação e SHALL tratar novos cabeçalhos, partes de mensagem ou metadados como não autorizados por padrão.

#### Scenario: Novo campo chega na API
- **WHEN** cliente, navegador ou provedor envia um campo não previsto
- **THEN** o campo não é persistido até existir requisito e revisão de governança específicos

#### Scenario: Log de erro
- **WHEN** ocorre falha de captura, consulta ou descriptografia
- **THEN** logs contêm apenas identificadores técnicos e categorias sanitizadas, sem mensagem, IP, User-Agent, chave ou conteúdo RAG

### Requirement: Segredos isolados e versionados
O sistema MUST usar segredos exclusivos para HMAC e criptografia de IP, SHALL obtê-los do ambiente seguro e SHALL versionar o envelope criptográfico para permitir rotação.

#### Scenario: Segredo ausente ou inválido
- **WHEN** a observabilidade é habilitada sem chaves válidas
- **THEN** a captura protegida falha como indisponível sem armazenar IP em texto e sem impedir o chat

#### Scenario: Rotação de chave
- **WHEN** uma nova versão da chave é ativada
- **THEN** novos IPs usam a nova versão e valores ainda retidos podem ser lidos com a versão registrada durante a janela de migração

### Requirement: Isolamento do banco de telemetria
As tabelas e funções de telemetria MUST negar acesso direto aos papéis públicos e SHALL ser acessadas somente por código server-side autorizado.

#### Scenario: Cliente anônimo consulta Supabase
- **WHEN** o papel `anon` tenta ler ou alterar uma tabela ou função de telemetria
- **THEN** o banco nega a operação

#### Scenario: API administrativa consulta dados
- **WHEN** uma rota server-side valida a sessão administrativa e usa a service role
- **THEN** a operação autorizada pode acessar somente os campos necessários à resposta

### Requirement: Retenção automática diferenciada
O sistema SHALL apagar o IP criptografado após 7 dias, conversas e telemetria associada após 30 dias e auditorias após 90 dias, permitindo configuração explícita anterior ao deploy.

#### Scenario: IP atinge o prazo
- **WHEN** o IP criptografado ultrapassa sua retenção
- **THEN** o valor criptografado é removido e o hash permanece somente até a expiração da conversa

#### Scenario: Conversa atinge o prazo
- **WHEN** a conversa ultrapassa sua retenção
- **THEN** conversa, mensagens, execuções e hash do IP são excluídos em cascata

#### Scenario: Auditoria atinge o prazo
- **WHEN** um evento de auditoria ultrapassa sua retenção
- **THEN** o evento é excluído sem afetar dados ainda dentro do prazo

#### Scenario: Execução repetida da limpeza
- **WHEN** o job diário executa mais de uma vez sobre o mesmo intervalo
- **THEN** a função de retenção permanece idempotente e registra o resultado agregado da execução

### Requirement: Auditoria de operações sensíveis
O sistema SHALL registrar horário, tipo de ação, alvo e identificador técnico da sessão administrativa para revelação de IP e exclusão, sem copiar o dado revelado ou a mensagem.

#### Scenario: IP revelado
- **WHEN** uma revelação autorizada é concluída ou negada
- **THEN** a auditoria registra o resultado e o alvo sem armazenar o IP

#### Scenario: Conversa excluída
- **WHEN** uma exclusão administrativa é solicitada
- **THEN** a auditoria registra a ação sem copiar o conteúdo que será removido

### Requirement: Exclusão segura e transacional
O sistema SHALL excluir uma conversa e seus dados dependentes de forma transacional e MUST impedir que caches administrativos continuem servindo o conteúdo removido.

#### Scenario: Exclusão concluída
- **WHEN** a transação de exclusão confirma
- **THEN** consultas posteriores não retornam a conversa, mensagens, execuções ou IP associado

#### Scenario: Falha durante a exclusão
- **WHEN** a transação não pode ser concluída integralmente
- **THEN** nenhuma exclusão parcial é confirmada e a API retorna erro sanitizado

### Requirement: Coleta controlada por configuração
O sistema SHALL possuir uma configuração server-side para habilitar ou desabilitar novas gravações de observabilidade sem alterar a disponibilidade do chat.

#### Scenario: Observabilidade desabilitada
- **WHEN** a configuração está desabilitada
- **THEN** o chat responde normalmente sem criar novas conversas, mensagens ou execuções de telemetria

#### Scenario: Observabilidade habilitada
- **WHEN** a configuração e os segredos obrigatórios são válidos
- **THEN** novas interações seguem a política de captura definida
