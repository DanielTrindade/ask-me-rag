## 1. Banco e contrato de recuperação

- [x] 1.1 Adicionar testes pgTAP para indexação bilíngue, normalização de acentos, ranking, atualização automática e privilégios do RPC FTS.
- [x] 1.2 Criar a migração expansiva `0008_postgres_fts_rag.sql` com `unaccent`, `search_vector`, trigger, backfill, GIN e `search_documents`, preservando os contratos vetoriais para rollback.
- [x] 1.3 Atualizar `supabase/schema.sql` para refletir o schema expansivo e validar migrações, testes e lint do banco local.

## 2. Recuperação, ingestão e prontidão

- [x] 2.1 Atualizar testes e `lib/rag.ts` para chamar `search_documents`, mapear locale para idioma, ordenar por `rank` e não gerar embedding.
- [x] 2.2 Passar o locale resolvido da rota de chat para a recuperação e atualizar os testes da rota.
- [x] 2.3 Atualizar testes e rota de ingestão para persistir somente conteúdo/metadados e confiar no trigger FTS.
- [x] 2.4 Atualizar testes e health check para exercitar o RPC FTS sem chamar qualquer provider de IA.

## 3. Remoção do runtime de embeddings

- [x] 3.1 Remover contratos, cache e configuração TypeScript específicos de embeddings, ajustando testes de governança, cache e runtime Groq.
- [x] 3.2 Remover módulos/testes Google e Vertex e desinstalar `@ai-sdk/google`, `@ai-sdk/google-vertex` e `google-auth-library`.
- [x] 3.3 Atualizar `.env.example` e textos administrativos para descrever ingestão e recuperação FTS sem configuração de embeddings.

## 4. Pipeline e operação

- [x] 4.1 Atualizar validador, preflight, bootstrap, preenchimento e verificação de segredos para exigir somente Groq como credencial de IA.
- [x] 4.2 Atualizar deploy, testes, Cloud Build e GitHub Actions para remover substituições de embedding e limpar variáveis/segredos legados da nova revisão Cloud Run.
- [x] 4.3 Atualizar o smoke operacional do chat com payload válido e manter a validação ponta a ponta de FTS + Groq.

## 5. Documentação e validação

- [x] 5.1 Atualizar README, documentação de providers, runbook e migrações com a arquitetura FTS, rollout expand/contract e limpeza pós-promoção.
- [x] 5.2 Executar testes focados da aplicação e scripts, corrigindo regressões.
- [x] 5.3 Executar a suíte completa, lint, testes/lint do banco e build de produção.
- [x] 5.4 Validar os artefatos OpenSpec e revisar o diff final por credenciais ou referências ativas a Google/Vertex.
