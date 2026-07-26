begin;

create extension if not exists pgtap with schema extensions;

select plan(22);

select has_column('public', 'chat_requests', 'governance_decision', 'decisão de governança existe');
select has_column('public', 'chat_requests', 'cache_status', 'status de cache existe');
select has_column('public', 'chat_requests', 'provider_attempts', 'tentativas existem');
select has_column('public', 'chat_requests', 'retryable', 'retryability existe');
select has_column('public', 'chat_requests', 'provider_called', 'chamada ao provider existe');
select has_column('public', 'chat_requests', 'input_cost_usd', 'custo de entrada existe');
select has_column('public', 'chat_requests', 'output_cost_usd', 'custo de saída existe');
select has_column('public', 'chat_requests', 'total_cost_usd', 'custo total existe');
select has_column('public', 'chat_requests', 'cost_currency', 'moeda existe');
select has_column('public', 'chat_requests', 'pricing_version', 'versão de preço existe');
select has_table('public', 'chat_usage_alerts', 'eventos de limiar existem');
select ok(
  (select relrowsecurity from pg_class where oid = 'chat_usage_alerts'::regclass),
  'RLS está habilitada nos eventos'
);
select ok(
  not has_function_privilege(
    'anon',
    'finish_chat_request_v2(uuid,text,text,text,text,jsonb,integer,text,text,text,integer,integer,integer,text,text,text,integer,boolean,boolean,numeric,numeric,numeric,text,text)',
    'execute'
  ),
  'anon não finaliza telemetria v2'
);
select ok(
  has_function_privilege(
    'service_role',
    'finish_chat_request_v2(uuid,text,text,text,text,jsonb,integer,text,text,text,integer,integer,integer,text,text,text,integer,boolean,boolean,numeric,numeric,numeric,text,text)',
    'execute'
  ),
  'service_role finaliza telemetria v2'
);

select is(
  begin_chat_request(
    '70000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'user-metrics-1', 'Pergunta', null, null, 'desktop', false,
    'Windows', '11', 'Chrome', '140', 'pt-br', 'trace-metrics-1', null
  ),
  '70000000-0000-4000-8000-000000000001'::uuid,
  'requisição de teste foi iniciada'
);

select ok(
  finish_chat_request_v2(
    '70000000-0000-4000-8000-000000000001', 'completed',
    'assistant-metrics-1', 'Resposta', 'complete', '[]'::jsonb, 120,
    'google', 'gemini-2.5-flash-lite', 'stop', 1000, 500, 1500, null,
    'allowed', 'miss', 2, false, true,
    0.0001, 0.0002, 0.0003, 'USD', '2026-07-17'
  ),
  'finalização v2 aceita métricas completas'
);

select ok(
  (select governance_decision = 'allowed' and cache_status = 'miss'
    and provider_attempts = 2 and provider_called
    and total_cost_usd = 0.0003 and total_tokens = 1500
   from chat_requests where id = '70000000-0000-4000-8000-000000000001'),
  'requisição persiste governança, tentativas, tokens e custo'
);

select ok(
  (chat_observability_summary(now() - interval '1 minute', now() + interval '1 minute')
    ?& array['knownCostUsd', 'unknownCostRequests', 'cacheHitRate', 'providerModels', 'failuresByCategory']),
  'resumo expõe custo, cache, providers e falhas'
);

select ok(
  ((get_chat_conversation('71000000-0000-4000-8000-000000000001')->'requests'->0)
    ?& array['governanceDecision', 'cacheStatus', 'providerAttempts', 'totalCostUsd', 'pricingVersion']),
  'detalhe expõe métricas sanitizadas'
);

insert into chat_usage_buckets (
  scope, bucket_key, window_kind, window_start, window_end,
  admitted_count, blocked_count, limit_value
) values (
  'global', 'global', 'day', '2035-01-01 00:00:00+00', '2035-01-02 00:00:00+00',
  90, 0, 100
) on conflict (scope, bucket_key, window_kind, window_start) do update set
  admitted_count = 90, limit_value = 100;

select is(
  record_chat_usage_thresholds(100, '2035-01-01 12:00:00+00'),
  3,
  'cruzamento de 90% emite 50, 75 e 90 uma única vez'
);
select is(
  record_chat_usage_thresholds(100, '2035-01-01 12:01:00+00'),
  0,
  'reavaliação não duplica eventos'
);
select is(
  (select count(*)::integer from chat_usage_alerts
    where window_start = '2035-01-01 00:00:00+00'),
  3,
  'persistência contém somente três limiares sanitizados'
);

select * from finish();

rollback;
