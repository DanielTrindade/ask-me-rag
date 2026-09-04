begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

select ok(
  (select pg_get_constraintdef(oid) like '%provider_attempts%<= 5%'
    from pg_constraint where conname = 'chat_requests_provider_attempts_check'),
  'constraint de tentativas aceita até 5'
);

select ok(
  (select pg_get_constraintdef(oid) not like '%<= 3%'
    from pg_constraint where conname = 'chat_requests_provider_attempts_check'),
  'limite antigo de 3 foi ampliado'
);

select is(
  begin_chat_request(
    '90000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    'user-attempts-5', 'Pergunta', null, null, 'desktop', false,
    'Windows', '11', 'Chrome', '140', 'pt-br', 'trace-attempts-5', null
  ),
  '90000000-0000-4000-8000-000000000001'::uuid,
  'requisição de teste foi iniciada'
);

select ok(
  finish_chat_request_v2(
    '90000000-0000-4000-8000-000000000001', 'completed',
    'assistant-attempts-5', 'Resposta', 'complete', '[]'::jsonb, 120,
    'groq', 'openai/gpt-oss-20b', 'stop', 1000, 500, 1500, null,
    'allowed', 'miss', 5, false, true,
    0.0001, 0.0002, 0.0003, 'USD', '2026-07-17'
  ),
  'finalização v2 aceita 5 tentativas (fluxo verificado)'
);

select * from finish();

rollback;