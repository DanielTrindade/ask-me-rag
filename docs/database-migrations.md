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

## Full-Text Search (migração 0008)

A migração `0008_postgres_fts_rag.sql` é expansiva: adiciona a coluna `documents.search_vector` (`tsvector`), preenchida por trigger com `to_tsvector` em português e inglês normalizado por `unaccent`, indexada por GIN, e expõe o RPC `search_documents(text, text, integer)` somente a `service_role`.

A contração do schema vetorial (`documents.embedding`, índice HNSW e o RPC `match_documents`) está fora desta entrega. Mantenha esses artefatos durante a janela de rollback e remova-os em uma migração posterior, somente depois de 100% do tráfego estar na revisão FTS e nenhuma revisão ativa depender deles.

## Recuperação textual refinada (migração 0009)

A migração `0009_refine_postgres_fts_rag.sql` adiciona o RPC expansivo `search_documents_v2(text, text, text, integer)`. O primeiro texto contém a pergunta original e preserva a correspondência conjuntiva como sinal de alta precisão; o segundo contém somente uma expansão lexical determinística criada pela aplicação. O RPC usa todos esses lexemas em uma consulta OR indexável pelo GIN e ordena os resultados por bônus estrito, cobertura dos termos originais, cobertura expandida e `ts_rank_cd`.

O RPC `search_documents(text, text, integer)` da migração 0008 permanece disponível durante o rollout para que a revisão anterior do Cloud Run continue saudável. Assim como o v1, o v2 pode ser executado somente por `service_role`.

O v2 amplia recall e tolera perguntas em que nem todos os termos aparecem no mesmo chunk, mas continua sendo recuperação lexical. Ele não identifica relações semânticas gerais fora do vocabulário expandido; acompanhe perguntas sem fontes e adicione expansões apenas com evidência de avaliação.

