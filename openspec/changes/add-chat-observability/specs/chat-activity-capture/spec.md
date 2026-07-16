## ADDED Requirements

### Requirement: Identidade limitada à conversa
O sistema SHALL atribuir a cada conversa pública um UUID aleatório mantido apenas durante a sessão do navegador e SHALL iniciar um novo UUID quando o usuário criar uma nova conversa.

#### Scenario: Continuação da conversa na mesma sessão
- **WHEN** o usuário envia vários turnos sem iniciar uma nova conversa
- **THEN** todas as requisições são associadas ao mesmo UUID de conversa

#### Scenario: Nova conversa
- **WHEN** o usuário aciona “Nova conversa”
- **THEN** o histórico local e o UUID anterior são substituídos por uma nova conversa independente

#### Scenario: Identificador inválido
- **WHEN** a API recebe um identificador ausente ou fora do formato UUID aceito
- **THEN** a requisição é rejeitada antes de persistir dados ou chamar o modelo

### Requirement: Persistência idempotente de mensagens
O sistema SHALL persistir apenas as partes textuais visíveis das mensagens de usuário e assistente e MUST impedir duplicação pela combinação de conversa e `message_id`.

#### Scenario: Histórico reenviado
- **WHEN** uma requisição contém mensagens que já foram persistidas em um turno anterior
- **THEN** as mensagens existentes não são duplicadas e somente o novo turno é acrescentado ou atualizado

#### Scenario: Repetição da mesma requisição
- **WHEN** uma tentativa é repetida com os mesmos identificadores
- **THEN** o estado persistido permanece equivalente a uma única execução lógica

#### Scenario: Parte não textual
- **WHEN** uma mensagem contém uma parte não autorizada pela política de captura
- **THEN** essa parte não é persistida na telemetria

### Requirement: Ciclo de vida observável da execução
O sistema SHALL criar uma execução com estado `running` antes da recuperação RAG/modelo e SHALL finalizá-la de forma idempotente como `completed`, `failed` ou `aborted`.

#### Scenario: Resposta concluída
- **WHEN** o stream termina normalmente
- **THEN** a resposta visível, duração, provedor, modelo, motivo de término e tokens disponíveis são persistidos e a execução fica `completed`

#### Scenario: Falha antes ou durante o stream
- **WHEN** a recuperação ou geração falha
- **THEN** a execução fica `failed` com categoria sanitizada e sem stack trace, segredo ou conteúdo RAG

#### Scenario: Cancelamento pelo usuário
- **WHEN** o usuário interrompe o stream
- **THEN** a execução fica `aborted` e qualquer texto parcial efetivamente disponibilizado pode ser persistido como parcial

#### Scenario: Falha da telemetria
- **WHEN** a persistência de observabilidade falha mas RAG e modelo continuam disponíveis
- **THEN** o chat continua funcionando e o erro é registrado sem conteúdo de mensagem ou IP

### Requirement: Captura protegida do IP
O sistema SHALL extrair o IP somente conforme uma quantidade explicitamente configurada de proxies confiáveis, SHALL validá-lo como IPv4 ou IPv6 e SHALL armazenar apenas derivados criptográficos fora da memória da requisição.

#### Scenario: Cadeia de proxies válida
- **WHEN** `X-Forwarded-For` corresponde à topologia configurada
- **THEN** o IP canônico gera um HMAC para agrupamento e um envelope criptografado para revelação autorizada

#### Scenario: Configuração ausente ou cabeçalho inválido
- **WHEN** a topologia não está configurada ou nenhum candidato é um IP válido
- **THEN** o IP da conversa é registrado como `unknown` e nenhum valor fornecido pelo cliente é aceito cegamente

#### Scenario: Log operacional
- **WHEN** a captura ou criptografia do IP falha
- **THEN** o log operacional descreve apenas a categoria da falha e não inclui cabeçalho, IP ou segredo

### Requirement: Classificação minimizada do dispositivo
O sistema SHALL derivar do User-Agent apenas tipo de dispositivo, bot, navegador, sistema operacional, versões principais e idioma preferencial, e MUST tratar esses valores como sinais aproximados.

#### Scenario: Navegador reconhecido
- **WHEN** o helper do Next.js reconhece a requisição
- **THEN** a conversa recebe valores normalizados de dispositivo, navegador, sistema e bot

#### Scenario: Navegador desconhecido ou falsificado
- **WHEN** algum valor não pode ser classificado
- **THEN** o campo correspondente recebe `unknown` sem bloquear o chat

#### Scenario: Limite de granularidade
- **WHEN** a requisição contém modelo, fabricante, CPU, versão completa ou Client Hint de alta entropia
- **THEN** esses detalhes não são persistidos

#### Scenario: User-Agent bruto
- **WHEN** a classificação é concluída
- **THEN** o User-Agent bruto não é armazenado em banco nem em logs

### Requirement: Limites e exclusões da captura
O sistema MUST validar quantidade, formato e tamanho das mensagens antes de persistir ou gerar e SHALL excluir system prompt, contexto RAG, embeddings, cookies, credenciais e cabeçalhos completos.

#### Scenario: Corpo excessivo
- **WHEN** a requisição ultrapassa um limite configurado de mensagens ou caracteres
- **THEN** a API responde com erro de validação sem chamar o modelo e sem persistir o conteúdo excessivo

#### Scenario: Contexto interno utilizado
- **WHEN** o RAG recupera trechos e o sistema monta o prompt interno
- **THEN** somente identificadores das fontes apresentados ao usuário podem ser registrados, nunca o contexto ou prompt completos

