## Context

O fluxo atual separa geração e recuperação: o Groq executa o GPT-OSS, enquanto Google AI Studio ou Vertex produz embeddings de 1536 dimensões usados por `match_documents`. Essa segunda chamada externa tornou a recuperação indisponível quando os créditos do Google acabaram. O banco já é PostgreSQL no Supabase, a base é compartilhada e pequena, o produto atende em português e inglês e o pipeline aplica migrações antes de publicar uma candidata Cloud Run com 0% de tráfego.

## Goals / Non-Goals

**Goals:**

- Usar Groq como único provedor de IA do runtime.
- Recuperar trechos em português e inglês com PostgreSQL Full-Text Search, normalização de acentos, ranking e índice GIN.
- Reindexar os documentos existentes automaticamente e indexar futuras inserções/alterações no banco.
- Preservar o contrato de contexto, fontes, orçamento de tokens e streaming da rota de chat.
- Fazer o health check detectar banco sem o RPC FTS antes de a candidata ser considerada saudável.
- Permitir rollback seguro para a revisão vetorial atualmente em produção.

**Non-Goals:**

- Reproduzir a recuperação semântica ou busca por sinônimos oferecida por embeddings.
- Adicionar outro serviço de busca, modelo local ou provedor de embeddings.
- Alterar chunking, autenticação administrativa, governança de geração, telemetria ou interface do chat.
- Apagar os artefatos pgvector na migração expansiva; essa remoção pertence a uma migração de contração pós-promoção.

## Decisions

### 1. Coluna `tsvector` persistida, trigger e índice GIN

`documents.search_vector` armazenará um vetor combinado produzido pelas configurações `pg_catalog.portuguese` e `pg_catalog.english`. Um trigger `BEFORE INSERT OR UPDATE OF content` normalizará o texto com `unaccent`, gerará os dois vetores e os concatenará. Um índice GIN único atenderá ambas as línguas.

Essa opção evita recalcular `to_tsvector` em cada consulta e mantém a ingestão sem lógica linguística. Duas colunas e dois índices foram descartados porque duplicariam o contrato e a manutenção sem benefício relevante para a base atual. A configuração `simple` foi descartada porque manteria palavras funcionais de perguntas naturais e reduziria muito o recall.

### 2. RPC textual com idioma explícito e ranking nativo

O RPC `search_documents(query_text text, query_language text, match_count integer)` escolherá `portuguese` ou `english`, normalizará acentos, converterá a entrada com `websearch_to_tsquery` e ordenará correspondências por `ts_rank_cd`. O limite será restringido no banco entre 1 e 8, além da validação existente na aplicação.

A aplicação passará o locale já resolvido pela rota (`pt` ou `en`) para `retrieveContext`, que o mapeará para o idioma do RPC. O retorno continuará contendo conteúdo e metadados; `rank` substituirá o campo vetorial `similarity` somente dentro da camada RAG.

### 3. RPC privado para o `service_role`

`search_documents` terá execução revogada de `public`, `anon` e `authenticated` e concedida somente a `service_role`. A função será `STABLE`, usará `security invoker` e um `search_path` explícito. Assim, a política atual de impedir leitura direta da base pública permanece intacta.

### 4. Ingestão sem chamadas externas

`/api/ingest` continuará extraindo, dividindo, deduplicando e inserindo `content` e `metadata`. O trigger preencherá `search_vector`; nenhuma chave ou chamada de IA fará parte do upload. A revisão da base continuará sendo incrementada somente depois de inserções efetivas.

### 5. Remoção completa do runtime de embeddings

Serão removidos `lib/embeddings.ts`, o adapter Vertex, contratos e caches de embedding no TypeScript, dependências Google no `package.json`, variáveis de ambiente, validações, scripts de credenciais e substituições do pipeline. O deploy também removerá variáveis/segredos legados da nova revisão Cloud Run com `--remove-env-vars` e `--remove-secrets`.

O cache de respostas e a revisão da base permanecem, pois evitam gerações repetidas e não dependem de embeddings.

### 6. Migração expansiva antes da contração

A migração desta mudança adicionará extensão `unaccent`, coluna, trigger, backfill, índice e RPC FTS. Ela não apagará `match_documents`, a coluna `embedding`, o índice HNSW nem `chat_embedding_cache`, porque a revisão estável ainda os usa enquanto a candidata é criada e validada com 0% de tráfego.

Após promover a revisão FTS a 100% e encerrar a janela de rollback, uma mudança de contração removerá os artefatos vetoriais e, opcionalmente, o segredo Google e permissões Vertex do projeto GCP.

### 7. Health check exercita a recuperação

Em vez de consultar somente `schema_migrations`, `/api/health` chamará `search_documents` com uma consulta sentinela e limite 1. Um retorno vazio é saudável; erro, timeout ou RPC ausente torna a revisão indisponível. A verificação não chama Groq nem consome tokens.

## Risks / Trade-offs

- **[Recall lexical inferior ao semântico]** → Usar stemming em português/inglês, normalização de acentos, chunking existente e perguntas determinísticas para FAQs críticas; medir perguntas sem resultados antes de considerar busca híbrida.
- **[Vetor combinado aumenta o índice]** → A base é pequena e um único GIN evita duplicar índices e caminhos de consulta.
- **[Backfill segura linhas de `documents`]** → A migração atualiza somente a nova coluna via trigger e roda antes do deploy; a base pequena limita a duração esperada.
- **[Rollback para a revisão antiga ainda depende do Google]** → Manter temporariamente artefatos vetoriais, segredo e permissões atuais até o fim da janela de rollback.
- **[Variáveis legadas permanecem no GitHub Environment]** → O workflow deixa de lê-las e a nova revisão Cloud Run as remove explicitamente; a exclusão manual pode ocorrer depois da promoção.
- **[Perguntas formadas apenas por stopwords não geram consulta indexável]** → O RPC retorna lista vazia e o modelo segue o prompt de contexto ausente sem causar erro 500/503.

## Migration Plan

1. Aplicar a migração expansiva e os testes pgTAP; confirmar backfill e permissões do RPC.
2. Publicar a candidata Cloud Run com 0% de tráfego e sem configuração de embeddings.
3. Validar `/api/health` e perguntas representativas em português e inglês na URL candidata.
4. Promover gradualmente até 100%, mantendo a revisão anterior disponível para rollback.
5. Após a janela de validação, criar/aplicar a migração de contração que remove pgvector/cache e retirar segredo/permissões Google remanescentes.

Rollback antes da contração: redirecionar tráfego para a revisão anterior, que continua compatível com os artefatos vetoriais preservados. Depois da contração, rollback exige uma nova revisão FTS; não se deve restaurar a revisão dependente de embeddings.

## Open Questions

Nenhuma para a implementação expansiva. O tempo da janela de rollback e a data da contração serão decididos operacionalmente após observar a revisão em produção.
