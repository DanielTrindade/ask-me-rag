## ADDED Requirements

### Requirement: Admissão persistente antes do consumo
O sistema SHALL obter uma decisão atômica de admissão antes de chamar qualquer serviço externo de embedding ou geração e MUST negar a execução quando não puder confirmar orçamento disponível.

#### Scenario: Requisição admitida
- **WHEN** os limites por visitante, conversa e globais possuem capacidade
- **THEN** o sistema cria uma reserva idempotente e somente depois inicia embedding, recuperação e geração

#### Scenario: Armazenamento de governança indisponível
- **WHEN** a decisão persistente não pode ser obtida
- **THEN** o sistema não chama embedding nem LLM e retorna uma degradação temporária segura

### Requirement: Limites configuráveis por visitante
O sistema SHALL aplicar limites persistentes por visitante em janelas curta e diária, usando somente um identificador protegido e MUST permitir que os valores sejam configurados sem recompilar a aplicação.

#### Scenario: Rajada dentro do limite
- **WHEN** um visitante envia requisições abaixo do limite da janela curta
- **THEN** cada requisição elegível pode ser admitida normalmente

#### Scenario: Rajada excedida
- **WHEN** o visitante alcança o limite da janela curta
- **THEN** novas gerações são negadas até a expiração da janela sem consumir provider

#### Scenario: Limite diário do visitante excedido
- **WHEN** o contador diário protegido do visitante alcança o teto configurado
- **THEN** novas gerações desse visitante são negadas até a próxima janela diária

### Requirement: Teto global diário
O sistema SHALL manter um teto diário global de gerações autorizadas, alinhado à zona de reset configurada do provider, e MUST efetuar a reserva atomicamente sob concorrência.

#### Scenario: Última vaga concorrida
- **WHEN** duas instâncias tentam reservar simultaneamente a última vaga diária
- **THEN** apenas uma reserva é autorizada e o contador não ultrapassa o teto

#### Scenario: Teto global atingido
- **WHEN** o contador global alcança o limite diário
- **THEN** todas as novas gerações são degradadas sem chamar o provider até a próxima janela

### Requirement: Idempotência da execução lógica
O sistema MUST tratar a combinação de conversa e mensagem do usuário como uma única execução lógica e SHALL reutilizar a decisão existente em repetições.

#### Scenario: Reenvio da mesma mensagem
- **WHEN** a API recebe novamente os mesmos `conversationId` e `messageId`
- **THEN** nenhum novo contador é consumido e nenhuma geração paralela duplicada é iniciada

#### Scenario: Retry de infraestrutura
- **WHEN** a mesma requisição chega novamente após timeout do cliente
- **THEN** o sistema retorna o estado conhecido ou permite retomada apenas conforme o lease idempotente

### Requirement: Exclusão mútua por conversa
O sistema SHALL permitir no máximo uma geração ativa por conversa e MUST liberar ou expirar o lease de maneira segura após conclusão, falha, cancelamento ou timeout.

#### Scenario: Segunda mensagem durante geração
- **WHEN** uma conversa já possui geração ativa e recebe nova tentativa
- **THEN** a nova tentativa é rejeitada como conversa ocupada sem consumir nova reserva

#### Scenario: Instância interrompida
- **WHEN** uma instância termina sem liberar seu lease
- **THEN** o lease expira após o prazo configurado e não bloqueia a conversa indefinidamente

### Requirement: Kill switch operacional
O sistema SHALL oferecer uma configuração server-side que desabilita novas chamadas de chat ao LLM sem novo build e MUST continuar servindo a experiência degradada.

#### Scenario: Geração desabilitada
- **WHEN** o kill switch está ativo
- **THEN** nenhuma chamada de embedding ou geração é iniciada e o visitante recebe a alternativa pública configurada

#### Scenario: Geração reabilitada
- **WHEN** um operador remove o kill switch e a configuração é recarregada em nova revisão
- **THEN** a admissão volta a considerar os limites persistentes normais

### Requirement: Identidade minimizada para governança
O sistema MUST usar HMAC ou identificador de conversa para governança e MUST NOT persistir IP bruto, cabeçalhos completos, cookie ou segredo nas estruturas de limite.

#### Scenario: IP protegido disponível
- **WHEN** a topologia confiável permite derivar o HMAC do IP
- **THEN** o bucket do visitante usa o HMAC sem armazenar o endereço original

#### Scenario: IP protegido indisponível
- **WHEN** nenhum identificador de IP confiável pode ser derivado
- **THEN** o sistema aplica pelo menos limites por conversa e global sem confiar em valor arbitrário do cliente
