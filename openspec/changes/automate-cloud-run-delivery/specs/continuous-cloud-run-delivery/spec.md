## ADDED Requirements

### Requirement: Deploy automático depende da qualidade do mesmo commit
O sistema de entrega MUST iniciar o deploy de produção somente para um push em `main` cujo mesmo SHA tenha concluído com sucesso todas as validações obrigatórias de qualidade.

#### Scenario: Merge validado
- **WHEN** um commit é enviado a `main` e seus jobs de lint, testes e build terminam com sucesso
- **THEN** a entrega de produção é iniciada automaticamente para exatamente esse SHA

#### Scenario: Validação falha
- **WHEN** qualquer validação obrigatória do commit em `main` falha ou é cancelada
- **THEN** nenhuma imagem ou revisão desse commit é promovida para produção

#### Scenario: Pull request ainda não integrado
- **WHEN** as validações passam em uma branch de pull request
- **THEN** o sistema não inicia um deploy de produção

### Requirement: Gates validam código, container e automação
As validações obrigatórias MUST executar lint, testes, build de produção da aplicação, build do Dockerfile sem push, validação estática dos workflows e auditoria das dependências de produção com bloqueio para severidade alta ou crítica.

#### Scenario: Dockerfile inválido
- **WHEN** o código compila, mas a imagem de produção não pode ser construída
- **THEN** o check obrigatório falha antes do merge

#### Scenario: Workflow inválido
- **WHEN** uma alteração introduz sintaxe ou referência inválida em um workflow
- **THEN** a validação estática falha antes do merge

#### Scenario: Vulnerabilidade alta ou crítica
- **WHEN** a auditoria encontra vulnerabilidade alta ou crítica em dependência de produção
- **THEN** o check obrigatório falha e o commit não pode seguir para entrega automática

#### Scenario: Vulnerabilidade moderada sem correção
- **WHEN** a auditoria encontra somente vulnerabilidade moderada sem correção disponível
- **THEN** o finding é reportado para acompanhamento sem bloquear automaticamente o deploy

### Requirement: Artefato de deploy é imutável e rastreável
O pipeline MUST construir uma única imagem por commit, identificá-la pelo SHA completo e implantar o digest resolvido dessa imagem sem usar uma tag mutável como entrada.

#### Scenario: Construção do commit
- **WHEN** o pipeline constrói o commit aprovado
- **THEN** o Artifact Registry contém uma imagem identificada pelo SHA e metadados que ligam commit, build e repositório

#### Scenario: Promoção manual
- **WHEN** um operador solicita a promoção de um SHA já construído
- **THEN** o pipeline verifica a existência da imagem e promove o artefato existente sem reconstruí-lo

#### Scenario: SHA sem artefato
- **WHEN** um operador solicita a promoção de um SHA que não existe no Artifact Registry
- **THEN** o pipeline falha antes de criar ou alterar uma revisão do Cloud Run

### Requirement: Autenticação não usa chave Google estática
O workflow de deploy MUST autenticar no Google Cloud por identidade federada de curta duração e MUST limitar a confiança ao repositório e à branch de produção.

#### Scenario: Execução autorizada
- **WHEN** o workflow de produção de `main` solicita autenticação
- **THEN** ele obtém credenciais temporárias para a conta de serviço de disparo

#### Scenario: Origem não autorizada
- **WHEN** uma branch ou repositório fora da condição de confiança tenta obter a identidade
- **THEN** o Google Cloud recusa a troca do token

### Requirement: Deploys de produção são serializados
O sistema MUST impedir que dois deploys de produção alterem revisões, migrações ou tráfego simultaneamente e MUST impedir a promoção de um SHA que deixou de ser o HEAD de `main`.

#### Scenario: Dois merges próximos
- **WHEN** um segundo commit chega a `main` enquanto o primeiro deploy está em andamento
- **THEN** o segundo deploy aguarda e cada alteração de produção ocorre em ordem

#### Scenario: Commit ficou obsoleto
- **WHEN** um job está pronto para promover, mas seu SHA não é mais o HEAD de `main`
- **THEN** o job encerra sem promover a revisão obsoleta

