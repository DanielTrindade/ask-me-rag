## ADDED Requirements

### Requirement: Indexação textual automática e bilíngue
O sistema SHALL manter um índice Full-Text Search de cada trecho de documento usando normalização de acentos e análise em português e inglês, sem chamar um provedor de IA.

#### Scenario: Migração de conteúdo existente
- **WHEN** a migração FTS é aplicada a uma base que já contém documentos
- **THEN** todos os trechos existentes recebem um vetor textual pesquisável sem novo upload

#### Scenario: Ingestão de novo documento
- **WHEN** o administrador ingere um arquivo PDF, Markdown ou texto válido
- **THEN** os novos trechos são persistidos e indexados pelo PostgreSQL sem gerar embeddings

#### Scenario: Atualização de conteúdo
- **WHEN** o conteúdo de um trecho persistido é alterado
- **THEN** o índice textual desse trecho é atualizado automaticamente na mesma transação

### Requirement: Recuperação textual ranqueada
O sistema SHALL recuperar no máximo o número solicitado de trechos correspondentes à pergunta, ordenados por relevância textual e limitados ao orçamento de contexto existente.

#### Scenario: Pergunta em português sem acentos
- **WHEN** a pergunta em português omite acentos presentes no documento
- **THEN** a recuperação encontra e ranqueia o trecho normalizado correspondente

#### Scenario: Pergunta em inglês
- **WHEN** a pergunta é resolvida com locale inglês
- **THEN** a recuperação usa a configuração linguística inglesa e retorna trechos correspondentes

#### Scenario: Pergunta vazia ou sem termos indexáveis
- **WHEN** a pergunta está vazia ou produz uma consulta sem lexemas pesquisáveis
- **THEN** a recuperação retorna contexto e fontes vazios sem falhar a requisição

#### Scenario: Fonte e orçamento preservados
- **WHEN** mais trechos correspondem do que o limite de chunks ou tokens permite
- **THEN** somente os trechos incluídos no contexto contam nas referências de fonte

### Requirement: Acesso privado à recuperação
O sistema MUST permitir a execução do RPC de busca somente pelo `service_role` usado no servidor.

#### Scenario: Cliente anônimo tenta executar a busca
- **WHEN** `anon`, `authenticated` ou `public` tenta executar o RPC FTS
- **THEN** o PostgreSQL nega a execução

#### Scenario: Servidor executa a busca
- **WHEN** a aplicação chama o RPC com o `service_role`
- **THEN** o PostgreSQL permite a execução e retorna apenas conteúdo, metadados e ranking necessários ao RAG

### Requirement: Groq como único provedor de IA
O runtime de produção SHALL exigir apenas a credencial Groq para operações de IA e MUST NOT chamar Google AI Studio, Vertex ou outro provedor durante ingestão e recuperação.

#### Scenario: Configuração mínima de produção
- **WHEN** Supabase, sessão administrativa e `GROQ_API_KEY` estão configurados
- **THEN** o health check pode ficar saudável sem variáveis ou credenciais de embeddings

#### Scenario: Revisão Cloud Run nova
- **WHEN** o pipeline publica uma revisão candidata
- **THEN** a revisão recebe a chave Groq e remove variáveis e montagens de segredos legadas de embeddings

### Requirement: Verificação de prontidão do FTS
O health check SHALL verificar a disponibilidade do RPC textual sem chamar o Groq ou consumir tokens.

#### Scenario: Migração FTS aplicada
- **WHEN** o banco responde ao RPC sentinela, mesmo sem correspondências
- **THEN** a dependência de recuperação é considerada saudável

#### Scenario: RPC FTS ausente ou indisponível
- **WHEN** o RPC sentinela falha ou excede o timeout
- **THEN** o health check retorna HTTP 503 com a categoria pública `dependency`

### Requirement: Rollout compatível com a revisão anterior
O sistema SHALL introduzir o FTS de forma expansiva antes de remover os artefatos vetoriais exigidos pela revisão anterior.

#### Scenario: Candidata com zero tráfego
- **WHEN** a migração FTS é aplicada antes de publicar a candidata
- **THEN** a revisão estável continua operando com `match_documents` durante a validação

#### Scenario: Contração pós-promoção
- **WHEN** a revisão FTS está em 100% do tráfego e a janela de rollback terminou
- **THEN** uma mudança posterior pode remover coluna, índice, RPC e cache de embeddings sem interromper a produção
