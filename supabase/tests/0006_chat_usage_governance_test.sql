begin;

create extension if not exists pgtap with schema extensions;

select plan(39);

truncate table chat_generation_reservations, chat_usage_buckets,
  chat_response_cache, chat_embedding_cache;
update chat_knowledge_revision set revision = 0, updated_at = now() where singleton = true;

select ok(
  (select relrowsecurity from pg_class where oid = 'chat_usage_buckets'::regclass),
  'RLS está habilitada nos buckets'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'chat_generation_reservations'::regclass),
  'RLS está habilitada nas reservas'
);
select ok(
  not has_table_privilege('anon', 'chat_response_cache', 'select'),
  'anon não pode ler o cache de respostas'
);
select ok(
  not has_table_privilege('authenticated', 'chat_embedding_cache', 'insert'),
  'authenticated não pode gravar o cache de embeddings'
);
select ok(
  not has_function_privilege(
    'anon',
    'reserve_chat_generation(uuid,uuid,text,text,boolean,integer,integer,integer,integer,text,integer,timestamptz)',
    'execute'
  ),
  'anon não pode executar admissão'
);
select ok(
  has_function_privilege(
    'service_role',
    'reserve_chat_generation(uuid,uuid,text,text,boolean,integer,integer,integer,integer,text,integer,timestamptz)',
    'execute'
  ),
  'service_role pode executar admissão'
);

select is(
  reserve_chat_generation(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'disabled-1', repeat('a', 64), true,
    4, 50, 500, 50, 'America/Los_Angeles', 60,
    '2030-01-01 12:00:00+00'
  )->>'decision',
  'disabled',
  'kill switch nega antes de consumir buckets'
);

select is(
  reserve_chat_generation(
    '00000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    'allowed-1', repeat('b', 64), false,
    4, 50, 500, 50, 'America/Los_Angeles', 60,
    '2030-01-01 12:00:00+00'
  )->>'decision',
  'allowed',
  'primeira execução é admitida'
);
select is(
  reserve_chat_generation(
    '00000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000002',
    'allowed-1', repeat('b', 64), false,
    4, 50, 500, 50, 'America/Los_Angeles', 60,
    '2030-01-01 12:00:01+00'
  )->>'decision',
  'duplicate',
  'repetição reutiliza a execução lógica'
);
select is(
  reserve_chat_generation(
    '00000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000002',
    'busy-1', repeat('b', 64), false,
    4, 50, 500, 50, 'America/Los_Angeles', 60,
    '2030-01-01 12:00:02+00'
  )->>'decision',
  'conversation_busy',
  'segunda geração na mesma conversa é recusada'
);
select ok(
  finalize_chat_generation(
    '00000000-0000-4000-8000-000000000002', 'completed', '2030-01-01 12:00:10+00'
  ),
  'finalização libera o lease'
);
select ok(
  finalize_chat_generation(
    '00000000-0000-4000-8000-000000000002', 'completed', '2030-01-01 12:00:11+00'
  ),
  'finalização repetida é idempotente'
);
select is(
  reserve_chat_generation(
    '00000000-0000-4000-8000-000000000005',
    '10000000-0000-4000-8000-000000000002',
    'allowed-2', repeat('b', 64), false,
    4, 50, 500, 50, 'America/Los_Angeles', 60,
    '2030-01-01 12:00:12+00'
  )->>'decision',
  'allowed',
  'conversa volta a admitir após finalização'
);
select ok(finalize_chat_generation(
  '00000000-0000-4000-8000-000000000005', 'completed', '2030-01-01 12:00:20+00'
), 'segunda reserva é finalizada');

select is(
  reserve_chat_generation(
    '00000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000010',
    'minute-1', repeat('c', 64), false,
    1, 50, 500, 0, 'America/Los_Angeles', 60,
    '2030-02-01 12:00:00+00'
  )->>'decision',
  'allowed',
  'primeira vaga da janela curta é admitida'
);
select ok(finalize_chat_generation(
  '00000000-0000-4000-8000-000000000010', 'completed', '2030-02-01 12:00:10+00'
), 'lease da janela curta é finalizado');
select is(
  reserve_chat_generation(
    '00000000-0000-4000-8000-000000000011',
    '10000000-0000-4000-8000-000000000011',
    'minute-2', repeat('c', 64), false,
    1, 50, 500, 0, 'America/Los_Angeles', 60,
    '2030-02-01 12:00:20+00'
  )->>'decision',
  'visitor_limited',
  'janela curta bloqueia sem nova admissão'
);
select is(
  reserve_chat_generation(
    '00000000-0000-4000-8000-000000000012',
    '10000000-0000-4000-8000-000000000012',
    'minute-3', repeat('c', 64), false,
    1, 50, 500, 0, 'America/Los_Angeles', 60,
    '2030-02-01 12:01:00+00'
  )->>'decision',
  'allowed',
  'nova janela de minuto volta a admitir'
);
select ok(finalize_chat_generation(
  '00000000-0000-4000-8000-000000000012', 'completed', '2030-02-01 12:01:10+00'
), 'lease da nova janela é finalizado');

select is(
  reserve_chat_generation(
    '00000000-0000-4000-8000-000000000020',
    '10000000-0000-4000-8000-000000000020',
    'daily-1', repeat('d', 64), false,
    5, 1, 500, 0, 'America/Los_Angeles', 60,
    '2030-03-01 12:00:00+00'
  )->>'decision',
  'allowed',
  'primeira vaga diária do visitante é admitida'
);
select ok(finalize_chat_generation(
  '00000000-0000-4000-8000-000000000020', 'completed', '2030-03-01 12:00:10+00'
), 'lease diário é finalizado');
select is(
  reserve_chat_generation(
    '00000000-0000-4000-8000-000000000021',
    '10000000-0000-4000-8000-000000000021',
    'daily-2', repeat('d', 64), false,
    5, 1, 500, 0, 'America/Los_Angeles', 60,
    '2030-03-01 12:01:00+00'
  )->>'decision',
  'visitor_limited',
  'limite diário do visitante bloqueia em outra janela curta'
);

select is(
  reserve_chat_generation(
    '00000000-0000-4000-8000-000000000030',
    '10000000-0000-4000-8000-000000000030',
    'global-1', repeat('e', 64), false,
    5, 50, 2, 1, 'America/Los_Angeles', 60,
    '2030-04-01 12:00:00+00'
  )->>'decision',
  'allowed',
  'a última vaga global é admitida'
);
select is(
  reserve_chat_generation(
    '00000000-0000-4000-8000-000000000031',
    '10000000-0000-4000-8000-000000000031',
    'global-2', repeat('f', 64), false,
    5, 50, 2, 1, 'America/Los_Angeles', 60,
    '2030-04-01 12:00:01+00'
  )->>'decision',
  'global_limited',
  'a tentativa concorrente lógica não ultrapassa o teto'
);
select is(
  (select admitted_count from chat_usage_buckets
    where scope = 'global' and window_kind = 'day'
      and window_start = '2030-04-01 07:00:00+00'),
  1,
  'o contador global preserva exatamente uma admissão'
);
select is(
  (read_chat_daily_budget(
    repeat('e', 64), 'America/Los_Angeles', 2, 1, '2030-04-01 12:00:10+00'
  )->>'resetAt')::timestamptz,
  '2030-04-02 07:00:00+00'::timestamptz,
  'reset diário respeita a zona configurada'
);

do $$
begin
  perform finalize_chat_generation(
    '00000000-0000-4000-8000-000000000030', 'completed', '2030-04-01 12:00:20+00'
  );
end;
$$;

select is(
  reserve_chat_generation(
    '00000000-0000-4000-8000-000000000040',
    '10000000-0000-4000-8000-000000000040',
    'lease-1', repeat('1', 64), false,
    5, 50, 500, 0, 'UTC', 60,
    '2030-05-01 12:00:00+00'
  )->>'decision',
  'allowed',
  'lease para teste de expiração é criado'
);
select is(
  recover_expired_chat_generation_leases('2030-05-01 12:01:01+00'),
  1,
  'recuperação marca exatamente um lease expirado'
);
select is(
  (select status from chat_generation_reservations
    where request_id = '00000000-0000-4000-8000-000000000040'),
  'timed_out',
  'lease expirado recebe estado terminal'
);
select is(
  reserve_chat_generation(
    '00000000-0000-4000-8000-000000000041',
    '10000000-0000-4000-8000-000000000040',
    'lease-2', repeat('1', 64), false,
    5, 50, 500, 0, 'UTC', 60,
    '2030-05-01 12:01:02+00'
  )->>'decision',
  'allowed',
  'conversa pode ser admitida após recuperação do lease'
);

select lives_ok(
  $$select put_chat_response_cache(
    repeat('a', 32), repeat('b', 32), 'pt-BR', 'google', 'model', 'prompt-v1', 0,
    'Resposta completa', '[{"name":"cv.md","matchedChunks":1}]'::jsonb,
    '2030-06-02 00:00:00+00', '2030-06-01 00:00:00+00'
  )$$,
  'cache de resposta aceita entrada completa'
);
select is(
  get_chat_response_cache(repeat('a', 32), '2030-06-01 01:00:00+00')->>'responseText',
  'Resposta completa',
  'cache de resposta retorna hit válido'
);
select is(
  get_chat_response_cache(repeat('a', 32), '2030-06-03 00:00:00+00'),
  null,
  'cache de resposta ignora entrada expirada'
);

select lives_ok(
  $$select put_chat_embedding_cache(
    repeat('c', 32), repeat('d', 32), 'google', 'gemini-embedding-001', 1536, 'query',
    array_fill(0::real, array[1536])::vector,
    '2030-06-02 00:00:00+00', '2030-06-01 00:00:00+00'
  )$$,
  'cache de embedding aceita vetor compatível'
);
select ok(
  get_chat_embedding_cache(repeat('c', 32), '2030-06-01 01:00:00+00') is not null,
  'cache de embedding retorna hit válido'
);
select ok(
  get_chat_embedding_cache(repeat('c', 32), '2030-06-03 00:00:00+00') is null,
  'cache de embedding ignora entrada expirada'
);
select is(get_chat_knowledge_revision(), 0::bigint, 'revisão inicia em zero');
select is(increment_chat_knowledge_revision(), 1::bigint, 'revisão incrementa atomicamente');
select ok(
  (purge_chat_usage_governance('2030-06-10 00:00:00+00', 7)->>'responseCacheRemoved')::integer >= 1,
  'limpeza remove caches vencidos de forma idempotente'
);

select * from finish();

rollback;
