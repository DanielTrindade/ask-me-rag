begin;

create extension if not exists pgtap with schema extensions;

select plan(23);

select lives_ok(
  $$select begin_chat_request(
    'a2adfc13-1686-4b5f-b6f2-f786bfd21dd6',
    '92adfc13-1686-4b5f-b6f2-f786bfd21dd6',
    'user-1', 'Primeira pergunta', 'hash', 'v1.iv.cipher.tag',
    'desktop', false, 'Windows', '11', 'Chrome', '140', 'pt-br', 'trace-1', 4
  )$$,
  'inicia uma execução'
);

select lives_ok(
  $$select begin_chat_request(
    'a2adfc13-1686-4b5f-b6f2-f786bfd21dd6',
    '92adfc13-1686-4b5f-b6f2-f786bfd21dd6',
    'user-1', 'Primeira pergunta', 'hash', 'v1.iv.cipher.tag',
    'desktop', false, 'Windows', '11', 'Chrome', '140', 'pt-br', 'trace-1', 4
  )$$,
  'repetir o início é seguro'
);

select is(
  begin_chat_request(
    'c2adfc13-1686-4b5f-b6f2-f786bfd21dd6',
    '92adfc13-1686-4b5f-b6f2-f786bfd21dd6',
    'user-1', 'Primeira pergunta', 'hash', 'v1.iv.cipher.tag',
    'desktop', false, 'Windows', '11', 'Chrome', '140', 'pt-br', 'trace-retry', 5
  ),
  'a2adfc13-1686-4b5f-b6f2-f786bfd21dd6'::uuid,
  'uma repetição com novo request id reutiliza a execução lógica existente'
);

select is(
  (select count(*)::integer from chat_requests
    where conversation_id = '92adfc13-1686-4b5f-b6f2-f786bfd21dd6'
      and user_message_id = 'user-1'),
  1,
  'conversa e mensagem de usuário identificam uma única execução'
);

select is(
  (select count(*)::integer from chat_requests where id = 'a2adfc13-1686-4b5f-b6f2-f786bfd21dd6'),
  1,
  'a execução inicial não é duplicada'
);

select lives_ok(
  $$select record_chat_telemetry_write_ms(
    'a2adfc13-1686-4b5f-b6f2-f786bfd21dd6', 7
  )$$,
  'registra a duração da escrita por RPC privada'
);

select is(
  (select telemetry_write_ms from chat_requests
    where id = 'a2adfc13-1686-4b5f-b6f2-f786bfd21dd6'),
  7,
  'a duração da escrita é atualizada'
);

select is(
  (select count(*)::integer from chat_messages
    where conversation_id = '92adfc13-1686-4b5f-b6f2-f786bfd21dd6' and message_id = 'user-1'),
  1,
  'o turno do usuário não é duplicado'
);

select ok(
  finish_chat_request(
    'a2adfc13-1686-4b5f-b6f2-f786bfd21dd6', 'completed',
    'assistant-1', 'Primeira resposta', 'complete',
    '[{"name":"cv.md","matchedChunks":2}]'::jsonb,
    120, 'google', 'gemini-test', 'stop', 10, 5, 15, null
  ),
  'finaliza a execução'
);

select lives_ok(
  $$select finish_chat_request(
    'a2adfc13-1686-4b5f-b6f2-f786bfd21dd6', 'completed',
    'assistant-1', 'Primeira resposta', 'complete',
    '[{"name":"cv.md","matchedChunks":2}]'::jsonb,
    120, 'google', 'gemini-test', 'stop', 10, 5, 15, null
  )$$,
  'repetir a finalização é seguro'
);

select is(
  (select count(*)::integer from chat_messages
    where conversation_id = '92adfc13-1686-4b5f-b6f2-f786bfd21dd6' and message_id = 'assistant-1'),
  1,
  'a resposta do assistente não é duplicada'
);

select lives_ok(
  $$select begin_chat_request(
    'b2adfc13-1686-4b5f-b6f2-f786bfd21dd6',
    '92adfc13-1686-4b5f-b6f2-f786bfd21dd6',
    'user-2', 'Segunda pergunta', 'hash', 'v1.iv.cipher.tag',
    'desktop', false, 'Windows', '11', 'Chrome', '140', 'pt-br', 'trace-2', 3
  );
  select finish_chat_request(
    'b2adfc13-1686-4b5f-b6f2-f786bfd21dd6', 'aborted',
    'assistant-2', 'Resposta parcial', 'partial', '[]'::jsonb,
    80, 'google', 'gemini-test', 'other', null, null, null, null
  )$$,
  'persiste uma resposta parcial cancelada'
);

select ok(
  exists(
    select 1 from chat_messages
    where conversation_id = '92adfc13-1686-4b5f-b6f2-f786bfd21dd6'
      and message_id = 'assistant-2' and status = 'partial'
  ),
  'a resposta parcial permanece identificada'
);

select is(
  jsonb_array_length(
    get_chat_conversation('92adfc13-1686-4b5f-b6f2-f786bfd21dd6')->'messages'
  ),
  4,
  'o detalhe retorna a linha do tempo completa'
);

select ok(
  not has_table_privilege('anon', 'chat_conversations', 'select'),
  'anon não pode ler conversas'
);

select ok(
  has_table_privilege('service_role', 'chat_conversations', 'select'),
  'service role pode ler o envelope protegido no código server-side'
);

select ok(
  not has_table_privilege('authenticated', 'chat_messages', 'insert'),
  'authenticated não pode gravar mensagens'
);

select ok(
  not has_function_privilege(
    'anon',
    'begin_chat_request(uuid,uuid,text,text,text,text,text,boolean,text,text,text,text,text,text,integer)',
    'execute'
  ),
  'anon não pode executar a RPC de captura'
);

select ok(
  not has_function_privilege(
    'anon',
    'record_chat_telemetry_write_ms(uuid,integer)',
    'execute'
  ),
  'anon não pode atualizar a métrica de escrita'
);

select lives_ok(
  $$select record_chat_telemetry_audit(
    'delete_conversation', '92adfc13-1686-4b5f-b6f2-f786bfd21dd6', 'denied_origin'
  );
  select record_chat_telemetry_audit(
    'reveal_ip', '92adfc13-1686-4b5f-b6f2-f786bfd21dd6', 'revealed'
  );
  select record_chat_telemetry_audit(
    'reveal_ip', '92adfc13-1686-4b5f-b6f2-f786bfd21dd6', 'unavailable'
  )$$,
  'aceita os resultados de auditoria usados pelas rotas administrativas'
);

select is(
  (select count(*)::integer from chat_telemetry_audit
    where target_conversation_id = '92adfc13-1686-4b5f-b6f2-f786bfd21dd6'),
  3,
  'registra todos os resultados administrativos esperados'
);

select ok(
  delete_chat_conversation('92adfc13-1686-4b5f-b6f2-f786bfd21dd6'),
  'a conversa é excluída'
);

select ok(
  not delete_chat_conversation('92adfc13-1686-4b5f-b6f2-f786bfd21dd6'),
  'a exclusão repetida é idempotente'
);

select * from finish();

rollback;
