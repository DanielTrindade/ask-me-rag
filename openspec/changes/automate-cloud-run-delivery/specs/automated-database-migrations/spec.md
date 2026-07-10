## ADDED Requirements

### Requirement: Migrações são aplicadas automaticamente antes da revisão
O pipeline MUST aplicar todas as migrações pendentes do Supabase em modo não interativo antes de criar a revisão candidata.

#### Scenario: Migrações aplicadas
- **WHEN** existem migrações pendentes válidas
- **THEN** o pipeline as aplica, registra a execução e prossegue para o deploy da aplicação

#### Scenario: Nenhuma migração pendente
- **WHEN** o schema remoto já contém todas as migrações versionadas
- **THEN** a etapa termina com sucesso sem alterar o banco

#### Scenario: Migração falha
- **WHEN** qualquer migração não pode ser aplicada
- **THEN** o pipeline falha antes de criar a revisão candidata ou alterar o tráfego

### Requirement: Banco novo é reproduzível apenas com arquivos versionados
O projeto MUST permitir criar o schema completo em um banco vazio usando somente a sequência versionada de migrações, sem copiar SQL manualmente pelo painel.

#### Scenario: Banco vazio
- **WHEN** a sequência de migrações é aplicada em uma instância nova compatível
- **THEN** tabelas, funções, índices, extensões e políticas necessárias à aplicação são criados

### Requirement: Migrações preservam compatibilidade de rollback
Toda migração executada junto a um deploy MUST manter a revisão estável anterior operacional durante a promoção e possível rollback.

#### Scenario: Mudança de schema aditiva
- **WHEN** uma nova versão precisa de coluna, índice, função ou política adicional
- **THEN** a migração adiciona a capacidade sem remover o contrato usado pela revisão anterior

#### Scenario: Mudança incompatível proposta
- **WHEN** uma migração tenta remover ou alterar de forma incompatível um contrato ainda usado pela revisão anterior
- **THEN** a mudança é dividida em fases expand/contract antes de ser aceita na entrega

### Requirement: Credenciais de migração são protegidas
O workflow MUST obter credenciais de banco apenas no environment de produção, MUST mascará-las nos logs e MUST limitar seu uso à etapa de migração.

#### Scenario: Execução da migração
- **WHEN** a etapa de migração acessa o banco remoto
- **THEN** nenhuma credencial é gravada no repositório, em artefatos ou em saída de log

