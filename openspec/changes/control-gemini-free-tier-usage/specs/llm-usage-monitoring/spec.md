## ADDED Requirements

### Requirement: Captura de uso real do provider
O sistema SHALL persistir tokens de entrada, saída e total informados pelo provider para execuções concluídas ou parciais e MUST representar ausência de medição como `null`.

#### Scenario: Provider informa uso
- **WHEN** a geração termina com métricas de tokens
- **THEN** os valores são associados à execução, provider e modelo

#### Scenario: Provider não informa uso
- **WHEN** a execução termina sem métricas confiáveis
- **THEN** tokens e custo permanecem indisponíveis e não são registrados como zero

### Requirement: Estimativa versionada de custo
O sistema SHALL calcular custo estimado por tabela versionada de preços e MUST identificar moeda, versão/data e provider/modelo usados no cálculo.

#### Scenario: Preço conhecido
- **WHEN** tokens reais e preço do modelo estão disponíveis
- **THEN** o sistema calcula separadamente entrada, saída e total estimado em USD

#### Scenario: Preço desconhecido
- **WHEN** não existe entrada de preço compatível
- **THEN** o custo estimado permanece `null` e o monitor sinaliza preço indisponível

### Requirement: Registro de decisões de governança
O sistema SHALL registrar contagens de admissões, cache hits, bloqueios e seus motivos sem persistir conteúdo adicional do visitante.

#### Scenario: Visitante limitado
- **WHEN** a reserva é negada pelo limite individual
- **THEN** o bucket e o resumo incrementam `visitor_limited` sem criar chamada faturável

#### Scenario: Cache evita geração
- **WHEN** uma resposta válida é atendida pelo cache
- **THEN** o resumo incrementa cache hit e não atribui tokens inexistentes à solicitação

### Requirement: Resumo administrativo de consumo
O monitor administrativo SHALL apresentar, para período selecionado, requisições admitidas, bloqueadas e concluídas, tokens, custo estimado, cache hit rate e distribuição de falhas por provider/modelo.

#### Scenario: Período com dados completos
- **WHEN** o administrador consulta um intervalo com uso medido
- **THEN** o monitor exibe totais e séries coerentes com as execuções persistidas

#### Scenario: Métricas parciais
- **WHEN** parte das execuções não possui tokens ou preço
- **THEN** o monitor separa valores conhecidos e desconhecidos sem estimar zero

### Requirement: Visibilidade do orçamento diário
O monitor administrativo SHALL exibir consumo versus limite interno global, janela de reset e estado do kill switch sem revelar credenciais ou limites secretos ao público.

#### Scenario: Aproximação do limite
- **WHEN** o consumo alcança limiar configurado de 50%, 75% ou 90%
- **THEN** o monitor destaca o nível correspondente e emite evento operacional sanitizado

#### Scenario: Limite alcançado
- **WHEN** o teto global diário é atingido
- **THEN** o monitor mostra estado bloqueado e horário previsto da próxima janela

### Requirement: Diagnóstico seguro por execução
O detalhe administrativo SHALL mostrar categoria de falha, tentativas, cache, decisão de governança, tokens e custo, mas MUST NOT mostrar response body bruto, prompt interno, contexto RAG ou segredo.

#### Scenario: Execução com 429
- **WHEN** o administrador inspeciona uma geração limitada pelo provider
- **THEN** o detalhe mostra categoria sanitizada, provider, modelo, tentativa e retryability

#### Scenario: Execução bloqueada antes do provider
- **WHEN** o administrador inspeciona uma reserva negada
- **THEN** o detalhe identifica o motivo e confirma ausência de chamada e tokens

### Requirement: Retenção e acesso coerentes com telemetria
O sistema SHALL aplicar às novas métricas a mesma proteção de acesso administrativo e política de retenção da observabilidade de chat, salvo contadores agregados sem identificador pessoal definidos separadamente.

#### Scenario: Cliente anônimo consulta métricas
- **WHEN** `anon` ou `authenticated` acessa tabelas/RPCs administrativas
- **THEN** o banco nega a operação

#### Scenario: Retenção executada
- **WHEN** dados identificáveis atingem o prazo configurado
- **THEN** são removidos ou agregados segundo a política sem quebrar os contadores do dia corrente
