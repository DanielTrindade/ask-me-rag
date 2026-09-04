-- 0010 — provider_attempts 0..5 (expansão retrocompatível)
-- O fluxo verificado conta chamadas reais ao provider: classificador (1),
-- tentativa inicial da geração (1), cada retry da geração (até 2) e
-- verificador de fundamentação quando executado (1). O teto passa de 3 para 5.
-- O intervalo 0..5 é superconjunto de 0..3; a revisão antiga continua válida.
-- Cinco é o máximo produzido pela aplicação.

alter table chat_requests
  drop constraint if exists chat_requests_provider_attempts_check;

do $$ begin
  alter table chat_requests add constraint chat_requests_provider_attempts_check
    check (provider_attempts >= 0 and provider_attempts <= 5);
exception when duplicate_object then null; end $$;

create or replace function finish_chat_request_v2(
  p_request_id uuid,
  p_status text,
  p_assistant_message_id text default null,
  p_assistant_content text default null,
  p_message_status text default 'complete',
  p_sources jsonb default '[]'::jsonb,
  p_duration_ms integer default null,
  p_provider text default null,
  p_model text default null,
  p_finish_reason text default null,
  p_input_tokens integer default null,
  p_output_tokens integer default null,
  p_total_tokens integer default null,
  p_error_category text default null,
  p_governance_decision text default 'off',
  p_cache_status text default 'ineligible',
  p_provider_attempts integer default 0,
  p_retryable boolean default null,
  p_provider_called boolean default false,
  p_input_cost_usd numeric default null,
  p_output_cost_usd numeric default null,
  p_total_cost_usd numeric default null,
  p_cost_currency text default null,
  p_pricing_version text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
begin
  if p_status not in ('completed', 'failed', 'aborted') then
    raise exception 'invalid terminal status';
  end if;
  if p_governance_decision not in (
    'off', 'allowed', 'duplicate', 'visitor_limited', 'global_limited',
    'conversation_busy', 'disabled', 'emergency_bypass', 'governance_unavailable'
  ) or p_cache_status not in ('ineligible', 'miss', 'hit', 'bypass')
    or p_provider_attempts not between 0 and 5 then
    raise exception 'invalid usage telemetry';
  end if;

  select conversation_id into v_conversation_id from chat_requests where id = p_request_id;
  if v_conversation_id is null then return false; end if;

  if p_assistant_message_id is not null and coalesce(p_assistant_content, '') <> '' then
    insert into chat_messages (
      conversation_id, message_id, role, content, status, sources
    ) values (
      v_conversation_id, p_assistant_message_id, 'assistant', p_assistant_content,
      case when p_message_status = 'partial' then 'partial' else 'complete' end,
      case when jsonb_typeof(p_sources) = 'array' then p_sources else '[]'::jsonb end
    ) on conflict (conversation_id, message_id) do update set
      content = excluded.content, status = excluded.status, sources = excluded.sources;
  end if;

  update chat_requests set
    assistant_message_id = coalesce(chat_requests.assistant_message_id, p_assistant_message_id),
    status = p_status,
    completed_at = coalesce(completed_at, now()),
    duration_ms = coalesce(duration_ms, p_duration_ms),
    provider = coalesce(provider, p_provider),
    model = coalesce(model, p_model),
    finish_reason = coalesce(finish_reason, p_finish_reason),
    input_tokens = coalesce(input_tokens, p_input_tokens),
    output_tokens = coalesce(output_tokens, p_output_tokens),
    total_tokens = coalesce(total_tokens, p_total_tokens),
    error_category = coalesce(error_category, p_error_category),
    governance_decision = p_governance_decision,
    cache_status = p_cache_status,
    provider_attempts = greatest(chat_requests.provider_attempts, p_provider_attempts),
    retryable = coalesce(p_retryable, chat_requests.retryable),
    provider_called = chat_requests.provider_called or p_provider_called,
    input_cost_usd = coalesce(chat_requests.input_cost_usd, p_input_cost_usd),
    output_cost_usd = coalesce(chat_requests.output_cost_usd, p_output_cost_usd),
    total_cost_usd = coalesce(chat_requests.total_cost_usd, p_total_cost_usd),
    cost_currency = coalesce(chat_requests.cost_currency, p_cost_currency),
    pricing_version = coalesce(chat_requests.pricing_version, p_pricing_version)
  where id = p_request_id and status = 'running';

  update chat_conversations set last_activity_at = now() where id = v_conversation_id;
  return true;
end;
$$;

revoke all on function finish_chat_request_v2(
  uuid, text, text, text, text, jsonb, integer, text, text, text,
  integer, integer, integer, text, text, text, integer, boolean, boolean,
  numeric, numeric, numeric, text, text
) from public, anon, authenticated;
grant execute on function finish_chat_request_v2(
  uuid, text, text, text, text, jsonb, integer, text, text, text,
  integer, integer, integer, text, text, text, integer, boolean, boolean,
  numeric, numeric, numeric, text, text
) to service_role;
