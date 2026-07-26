alter table chat_requests
  add column if not exists governance_decision text not null default 'off',
  add column if not exists cache_status text not null default 'ineligible',
  add column if not exists provider_attempts integer not null default 0,
  add column if not exists retryable boolean,
  add column if not exists provider_called boolean not null default false,
  add column if not exists input_cost_usd numeric(18, 12),
  add column if not exists output_cost_usd numeric(18, 12),
  add column if not exists total_cost_usd numeric(18, 12),
  add column if not exists cost_currency text,
  add column if not exists pricing_version text;

do $$ begin
  alter table chat_requests add constraint chat_requests_governance_decision_check
    check (governance_decision in (
      'off', 'allowed', 'duplicate', 'visitor_limited', 'global_limited',
      'conversation_busy', 'disabled', 'emergency_bypass', 'governance_unavailable'
    ));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table chat_requests add constraint chat_requests_cache_status_check
    check (cache_status in ('ineligible', 'miss', 'hit', 'bypass'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table chat_requests add constraint chat_requests_provider_attempts_check
    check (provider_attempts >= 0 and provider_attempts <= 3);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table chat_requests add constraint chat_requests_costs_check
    check (
      (input_cost_usd is null or input_cost_usd >= 0) and
      (output_cost_usd is null or output_cost_usd >= 0) and
      (total_cost_usd is null or total_cost_usd >= 0) and
      (cost_currency is null or cost_currency = 'USD')
    );
exception when duplicate_object then null; end $$;

create index if not exists chat_requests_governance_started_idx
  on chat_requests (governance_decision, started_at desc);
create index if not exists chat_requests_provider_model_started_idx
  on chat_requests (provider, model, started_at desc) where provider_called = true;

alter table chat_usage_buckets
  add column if not exists limit_value integer
    check (limit_value is null or limit_value > 0);

create table if not exists chat_usage_alerts (
  window_start timestamptz not null,
  window_end timestamptz not null,
  threshold_percent integer not null check (threshold_percent in (50, 75, 90, 100)),
  observed_count integer not null check (observed_count >= 0),
  limit_value integer not null check (limit_value > 0),
  occurred_at timestamptz not null default now(),
  primary key (window_start, threshold_percent)
);

alter table chat_usage_alerts enable row level security;
revoke all on chat_usage_alerts from public, anon, authenticated;

create or replace function record_chat_usage_thresholds(
  p_limit integer,
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bucket chat_usage_buckets%rowtype;
  v_threshold integer;
  v_inserted integer := 0;
begin
  if p_limit <= 0 then raise exception 'invalid usage limit'; end if;
  select * into v_bucket from chat_usage_buckets
  where scope = 'global' and bucket_key = 'global' and window_kind = 'day'
    and p_now >= window_start and p_now < window_end
  order by window_start desc limit 1
  for update;
  if not found then return 0; end if;

  update chat_usage_buckets set limit_value = p_limit
  where scope = v_bucket.scope and bucket_key = v_bucket.bucket_key
    and window_kind = v_bucket.window_kind and window_start = v_bucket.window_start;

  foreach v_threshold in array array[50, 75, 90, 100] loop
    if v_bucket.admitted_count * 100 >= p_limit * v_threshold then
      insert into chat_usage_alerts (
        window_start, window_end, threshold_percent, observed_count, limit_value
      ) values (
        v_bucket.window_start, v_bucket.window_end, v_threshold,
        v_bucket.admitted_count, p_limit
      ) on conflict (window_start, threshold_percent) do nothing;
      if found then v_inserted := v_inserted + 1; end if;
    end if;
  end loop;
  return v_inserted;
end;
$$;

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
    or p_provider_attempts not between 0 and 3 then
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

create or replace function chat_observability_summary(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with conversations_in_range as (
    select * from chat_conversations where started_at >= p_from and started_at < p_to
  ), requests_in_range as (
    select * from chat_requests where started_at >= p_from and started_at < p_to
  ), messages_in_range as (
    select * from chat_messages where created_at >= p_from and created_at < p_to
  ), device_counts as (
    select device_type as name, count(*) as count from conversations_in_range group by device_type
  ), browser_counts as (
    select browser_name as name, count(*) as count from conversations_in_range group by browser_name
  ), provider_models as (
    select provider, model, count(*) as requests, sum(total_tokens) as tokens,
      sum(total_cost_usd) as cost_usd
    from requests_in_range where provider_called = true group by provider, model
  ), failures as (
    select error_category as category, count(*) as count
    from requests_in_range where error_category is not null group by error_category
  ), retention as (
    select completed_at from chat_telemetry_retention_runs
    where status = 'completed' order by completed_at desc limit 1
  ), daily as (
    select admitted_count, limit_value, window_end from chat_usage_buckets
    where scope = 'global' and bucket_key = 'global' and window_kind = 'day'
      and now() >= window_start and now() < window_end
    order by window_start desc limit 1
  )
  select jsonb_build_object(
    'conversations', (select count(*) from conversations_in_range),
    'messages', (select count(*) from messages_in_range),
    'requests', (select count(*) from requests_in_range),
    'admitted', (select count(*) from requests_in_range where provider_called or cache_status = 'hit'),
    'blocked', (select count(*) from requests_in_range where not provider_called and cache_status <> 'hit'
      and governance_decision not in ('off', 'allowed', 'emergency_bypass')),
    'providerCalls', (select count(*) from requests_in_range where provider_called),
    'completed', (select count(*) from requests_in_range where status = 'completed'),
    'failed', (select count(*) from requests_in_range where status = 'failed'),
    'aborted', (select count(*) from requests_in_range where status = 'aborted'),
    'averageDurationMs', (select round(avg(duration_ms)) from requests_in_range where duration_ms is not null),
    'totalTokens', (select sum(total_tokens) from requests_in_range where total_tokens is not null),
    'knownCostUsd', (select sum(total_cost_usd) from requests_in_range where total_cost_usd is not null),
    'unknownCostRequests', (select count(*) from requests_in_range where provider_called and total_cost_usd is null),
    'cacheHits', (select count(*) from requests_in_range where cache_status = 'hit'),
    'cacheEligible', (select count(*) from requests_in_range where cache_status in ('hit', 'miss')),
    'cacheHitRate', (select round(100.0 * count(*) filter (where cache_status = 'hit') /
      nullif(count(*) filter (where cache_status in ('hit', 'miss')), 0), 2) from requests_in_range),
    'dailyUsage', (select admitted_count from daily),
    'dailyLimit', (select limit_value from daily),
    'dailyResetAt', (select window_end from daily),
    'providerModels', coalesce((select jsonb_agg(to_jsonb(provider_models) order by requests desc) from provider_models), '[]'::jsonb),
    'failuresByCategory', coalesce((select jsonb_agg(to_jsonb(failures) order by count desc) from failures), '[]'::jsonb),
    'devices', coalesce((select jsonb_agg(to_jsonb(device_counts) order by count desc) from device_counts), '[]'::jsonb),
    'browsers', coalesce((select jsonb_agg(to_jsonb(browser_counts) order by count desc) from browser_counts), '[]'::jsonb),
    'lastRetentionAt', (select completed_at from retention)
  );
$$;

create or replace function get_chat_conversation(p_conversation_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'conversation', jsonb_build_object(
      'id', c.id, 'startedAt', c.started_at, 'lastActivityAt', c.last_activity_at,
      'deviceType', c.device_type, 'isBot', c.is_bot, 'osName', c.os_name,
      'osMajor', c.os_major, 'browserName', c.browser_name,
      'browserMajor', c.browser_major, 'preferredLanguage', c.preferred_language,
      'ipAvailable', c.ip_encrypted is not null
    ),
    'messages', coalesce((select jsonb_agg(jsonb_build_object(
      'id', m.message_id, 'role', m.role, 'content', m.content,
      'status', m.status, 'sources', m.sources, 'createdAt', m.created_at
    ) order by m.created_at, m.message_id) from chat_messages m
      where m.conversation_id = c.id), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(jsonb_build_object(
      'id', r.id, 'userMessageId', r.user_message_id,
      'assistantMessageId', r.assistant_message_id, 'startedAt', r.started_at,
      'completedAt', r.completed_at, 'durationMs', r.duration_ms,
      'status', r.status, 'provider', r.provider, 'model', r.model,
      'finishReason', r.finish_reason, 'inputTokens', r.input_tokens,
      'outputTokens', r.output_tokens, 'totalTokens', r.total_tokens,
      'errorCategory', r.error_category, 'governanceDecision', r.governance_decision,
      'cacheStatus', r.cache_status, 'providerAttempts', r.provider_attempts,
      'retryable', r.retryable, 'providerCalled', r.provider_called,
      'inputCostUsd', r.input_cost_usd, 'outputCostUsd', r.output_cost_usd,
      'totalCostUsd', r.total_cost_usd, 'costCurrency', r.cost_currency,
      'pricingVersion', r.pricing_version
    ) order by r.started_at, r.id) from chat_requests r
      where r.conversation_id = c.id), '[]'::jsonb)
  ) from chat_conversations c where c.id = p_conversation_id;
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

revoke all on function record_chat_usage_thresholds(integer, timestamptz)
  from public, anon, authenticated;
grant execute on function record_chat_usage_thresholds(integer, timestamptz)
  to service_role;
