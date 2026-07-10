# Migrações de banco

Os arquivos em `supabase/migrations/` são a única fonte de verdade do schema. Um banco vazio deve ser criado executando as migrações em ordem; não aplique `supabase/schema.sql` manualmente.

## Regra expand/contract

Todo deploy deve permitir que a revisão nova e a revisão anterior funcionem sobre o mesmo schema durante promoção e rollback:

1. **Expandir:** adicionar colunas, funções, índices ou políticas sem remover contratos existentes.
2. **Migrar:** implantar o código novo e, quando necessário, preencher dados em uma migração idempotente ou job controlado.
3. **Contrair:** remover o contrato antigo somente em uma mudança posterior, depois de confirmar que nenhuma revisão ativa depende dele.

Migrações destrutivas, renomes diretos, mudanças de tipo incompatíveis e novas colunas `NOT NULL` sem valor padrão devem ser divididos nessas fases.

## Execução

Use uma URL PostgreSQL percent-encoded, armazenada como segredo:

```bash
SUPABASE_DB_URL='postgresql://...' bash scripts/setup-db.sh
```

Para listar o que seria aplicado sem modificar o banco:

```bash
MIGRATION_DRY_RUN=true SUPABASE_DB_URL='postgresql://...' bash scripts/setup-db.sh
```

O script não executa login, não cria vínculo persistente e não imprime a conexão. Falhas interrompem o deploy antes da criação de uma revisão do Cloud Run. Migrações aplicadas não são revertidas automaticamente; a recuperação é uma migração corretiva compatível.

