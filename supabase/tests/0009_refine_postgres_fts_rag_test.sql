begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

truncate table documents restart identity;

select ok(
  to_regprocedure('public.search_documents_v2(text,text,text,integer)') is not null,
  'RPC search_documents_v2 existe com o contrato esperado'
);

select ok(
  to_regprocedure('public.search_documents(text,text,integer)') is not null,
  'RPC search_documents v1 permanece disponível para rollback'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.search_documents_v2(text,text,text,integer)',
    'execute'
  ),
  'service_role pode executar a busca textual refinada'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.search_documents_v2(text,text,text,integer)',
    'execute'
  ),
  'anon não pode executar a busca textual refinada'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.search_documents_v2(text,text,text,integer)',
    'execute'
  ),
  'authenticated não pode executar a busca textual refinada'
);

insert into documents (content, metadata) values
  (
    'Experiência profissional em engenharia de software. Atuação como desenvolvedor TypeScript, React e Node.js com arquitetura de sistemas.',
    '{"source":"cv-daniel.md"}'::jsonb
  ),
  (
    'Competências culinárias, receitas domésticas e jardinagem.',
    '{"source":"correspondencia-superficial.md"}'::jsonb
  ),
  (
    'Professional experience building distributed software platforms. Skills include TypeScript, React and system architecture.',
    '{"source":"cv-daniel-en.md"}'::jsonb
  ),
  (
    'Agenda de eventos culturais e previsão do tempo.',
    '{"source":"irrelevante.md"}'::jsonb
  );

select is(
  (
    select count(*)
    from search_documents(
      'Resuma sua trajetória e principais competências.',
      'portuguese',
      3
    )
  ),
  0::bigint,
  'RPC v1 reproduz a perda de recall causada pela conjunção de todos os termos'
);

select is(
  (
    select metadata->>'source'
    from search_documents_v2(
      'Resuma sua trajetória e principais competências.',
      'experiência profissional carreira atuação habilidades tecnologias conhecimentos',
      'portuguese',
      3
    )
    limit 1
  ),
  'cv-daniel.md',
  'expansão lexical recupera e prioriza o currículo sobre correspondência superficial'
);

insert into documents (content, metadata) values
  (
    'Alpha beta gamma delta.',
    '{"source":"cobertura-original.md"}'::jsonb
  ),
  (
    'Epsilon zeta eta theta iota kappa lambda.',
    '{"source":"cobertura-expandida.md"}'::jsonb
  );

select ok(
  (
    select rank
    from search_documents_v2(
      'alpha beta gamma delta',
      'epsilon zeta eta theta iota kappa lambda',
      'english',
      8
    )
    where metadata->>'source' = 'cobertura-original.md'
  ) > (
    select rank
    from search_documents_v2(
      'alpha beta gamma delta',
      'epsilon zeta eta theta iota kappa lambda',
      'english',
      8
    )
    where metadata->>'source' = 'cobertura-expandida.md'
  ),
  'cobertura dos termos originais tem prioridade sobre a expansão lexical'
);

select is(
  (
    select count(*)
    from search_documents_v2(
      'professional background and skills',
      'professional experience career responsibilities technologies',
      'english',
      1
    )
  ),
  1::bigint,
  'RPC refinado respeita o limite solicitado'
);

select is(
  (
    select metadata->>'source'
    from search_documents_v2(
      'professional background and skills',
      'professional experience career responsibilities technologies',
      'english',
      3
    )
    limit 1
  ),
  'cv-daniel-en.md',
  'busca inglesa usa expansão e stemming do idioma solicitado'
);

select is(
  (
    select count(*)
    from search_documents_v2('termo inexistente', '', 'portuguese', 3)
  ),
  0::bigint,
  'consulta sem sinal lexical continua retornando vazio'
);

select * from finish();

rollback;
