begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

truncate table documents restart identity;

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'documents'
      and column_name = 'search_vector'
      and is_nullable = 'NO'
  ),
  'documents possui search_vector obrigatório'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'documents'
      and indexname = 'documents_search_vector_idx'
      and indexdef ilike '%using gin%'
  ),
  'documents possui índice GIN para busca textual'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.documents'::regclass
      and tgname = 'documents_search_vector_update'
      and not tgisinternal
  ),
  'documents atualiza o vetor textual por trigger'
);

select ok(
  to_regprocedure('public.search_documents(text,text,integer)') is not null,
  'RPC search_documents existe com o contrato esperado'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.search_documents(text,text,integer)',
    'execute'
  ),
  'service_role pode executar a busca textual'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.search_documents(text,text,integer)',
    'execute'
  ),
  'anon não pode executar a busca textual'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.search_documents(text,text,integer)',
    'execute'
  ),
  'authenticated não pode executar a busca textual'
);

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'documents'
      and column_name = 'embedding'
  ),
  'coluna vetorial permanece durante a janela de rollback'
);

select ok(
  to_regprocedure('public.match_documents(vector,integer,double precision)') is not null,
  'RPC vetorial permanece durante a janela de rollback'
);

insert into documents (content, metadata) values
  (
    'Experiência profissional com sistemas de pagamentos distribuídos e arquitetura resiliente.',
    '{"source":"cv-pt.md"}'::jsonb
  ),
  (
    'Built reliable payment platforms for international customers.',
    '{"source":"cv-en.md"}'::jsonb
  ),
  (
    'Payment platform payment platform with reliable payment operations.',
    '{"source":"payments-dense.md"}'::jsonb
  ),
  (
    'A payment service for distributed systems and a platform for internal teams.',
    '{"source":"payments-sparse.md"}'::jsonb
  ),
  (
    'Receitas culinárias e jardinagem doméstica.',
    '{"source":"irrelevante.md"}'::jsonb
  );

select is(
  (select count(*) from documents where search_vector is not null),
  5::bigint,
  'trigger indexa todos os novos trechos'
);

select is(
  (
    select metadata->>'source'
    from search_documents('experiencia pagamentos', 'portuguese', 3)
    limit 1
  ),
  'cv-pt.md',
  'busca portuguesa normaliza acentos e flexões'
);

select is(
  (
    select metadata->>'source'
    from search_documents('reliable payments platform', 'english', 3)
    limit 1
  ),
  'payments-dense.md',
  'busca inglesa aplica stemming e ordena por densidade'
);

select is(
  (select count(*) from search_documents('payment platform', 'english', 1)),
  1::bigint,
  'RPC respeita o limite solicitado'
);

select is(
  (select count(*) from search_documents('', 'portuguese', 3)),
  0::bigint,
  'consulta vazia retorna conjunto vazio'
);

insert into documents (content, metadata)
values ('conteúdo legado', '{"source":"atualizado.md"}'::jsonb);

update documents
set content = 'Modernização observável da plataforma'
where metadata->>'source' = 'atualizado.md';

select is(
  (
    select metadata->>'source'
    from search_documents('modernizacao observavel', 'portuguese', 3)
    limit 1
  ),
  'atualizado.md',
  'trigger reindexa alterações de conteúdo'
);

select is(
  (
    select count(*)
    from search_documents('conteudo legado', 'portuguese', 3)
    where metadata->>'source' = 'atualizado.md'
  ),
  0::bigint,
  'reindexação remove lexemas do conteúdo anterior'
);

select ok(
  to_regclass('public.chat_embedding_cache') is not null,
  'cache vetorial permanece durante a janela de rollback'
);

select * from finish();

rollback;
