## ADDED Requirements

### Requirement: Revisão candidata não recebe tráfego antes da validação
O pipeline MUST criar a nova revisão do Cloud Run sem tráfego de produção e MUST aguardar que ela esteja pronta antes de executar os smoke tests.

#### Scenario: Candidata fica pronta
- **WHEN** o Cloud Run informa que a nova revisão está Ready
- **THEN** o pipeline testa a URL exclusiva da candidata sem alterar o tráfego público

#### Scenario: Candidata não fica pronta
- **WHEN** a nova revisão falha ou excede o tempo limite de prontidão
- **THEN** o pipeline falha e a revisão anteriormente estável continua recebendo todo o tráfego

### Requirement: Promoção depende do smoke test da candidata
O pipeline MUST promover 100% do tráfego para a candidata somente depois que todas as verificações determinísticas da candidata passarem.

#### Scenario: Smoke test aprovado
- **WHEN** a candidata responde satisfatoriamente a todas as verificações dentro da política de tentativas
- **THEN** o pipeline direciona 100% do tráfego à nova revisão

#### Scenario: Smoke test reprovado
- **WHEN** qualquer verificação da candidata continua falhando após as tentativas permitidas
- **THEN** o pipeline encerra com falha e não muda o tráfego de produção

### Requirement: Falha após promoção restaura a revisão estável
O pipeline MUST registrar a revisão estável antes do deploy e MUST restaurar 100% do tráfego a ela se a verificação pública posterior à promoção falhar.

#### Scenario: Verificação pública aprovada
- **WHEN** a nova revisão é promovida e a URL pública passa no smoke test
- **THEN** o deploy termina com sucesso e registra a revisão promovida

#### Scenario: Verificação pública reprovada
- **WHEN** a URL pública falha após a promoção
- **THEN** o pipeline restaura o tráfego à revisão estável registrada e termina com falha

### Requirement: Operação de emergência reutiliza o mesmo mecanismo seguro
O pipeline MUST fornecer acionamento manual para promover uma imagem conhecida e MUST aplicar os mesmos preflights, smoke tests e rollback do fluxo automático.

#### Scenario: Reimplantação de versão conhecida
- **WHEN** um operador autorizado informa um SHA existente no acionamento manual
- **THEN** o pipeline executa o fluxo de candidata sem tráfego e promoção segura

