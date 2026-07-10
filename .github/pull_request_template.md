## Resumo

<!-- Explique o que mudou e por quê. -->

## Validação

- [ ] Lint, testes e build passaram.
- [ ] O container de produção foi construído.
- [ ] Não há segredo, credencial ou configuração sensível no diff.

## Banco de dados

- [ ] Esta mudança não altera o schema; ou a migração está versionada em `supabase/migrations/`.
- [ ] A migração segue expand/contract e mantém a revisão anterior operacional durante rollback.
- [ ] A sequência completa foi validada em banco descartável e o dry-run remoto foi revisado.
