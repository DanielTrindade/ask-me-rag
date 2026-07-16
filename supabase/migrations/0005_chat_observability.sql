-- Migration 0005: privacy-conscious chat observability.
-- Idempotent so it can be applied to databases created before migrations were adopted.

create table if not exists chat_conversations (
  id uuid primary key,
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  ip_hash text,
  ip_encrypted text,
  device_type text not null default 'unknown'
    check (device_type in ('desktop', 'mobile', 'tablet', 'bot', 'other', 'unknown')),
  is_bot boolean not null default false,
  os_name text not null default 'unknown',
  os_major text not null default 'unknown',
  browser_name text not null default 'unknown',
  browser_major text not null default 'unknown',
  preferred_language text not null default 'unknown'
);

create table if not exists chat_messages (
  conversation_id uuid not null references chat_conversations(id) on delete cascade,
  message_id text not null check (char_length(message_id) between 1 and 128),
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  status text not null default 'complete' check (status in ('complete', 'partial')),
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  created_at timestamptz not null default now(),
  primary key (conversation_id, message_id)
);

create table if not exists chat_requests (
  id uuid primary key,
  conversation_id uuid not null references chat_conversations(id) on delete cascade,
  user_message_id text not null,
  assistant_message_id text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  telemetry_write_ms integer check (telemetry_write_ms is null or telemetry_write_ms >= 0),
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed', 'aborted')),
  provider text,
  model text,
  finish_reason text,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  total_tokens integer check (total_tokens is null or total_tokens >= 0),
  error_category text,
  trace_id text
);

create table if not exists chat_telemetry_audit (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  action text not null check (action in ('reveal_ip', 'delete_conversation')),
  target_conversation_id uuid,
  session_id text not null default 'shared-admin-session',
  outcome text not null check (outcome in ('allowed', 'denied', 'denied_origin', 'revealed', 'unavailable', 'not_found', 'deleted'))
);

create table if not exists chat_telemetry_retention_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null,
  completed_at timestamptz not null default now(),
  status text not null check (status in ('completed', 'failed')),
  encrypted_ips_removed integer not null default 0,
  conversations_removed integer not null default 0,
  audits_removed integer not null default 0
);

create index if not exists chat_conversations_last_activity_idx
  on chat_conversations (last_activity_at desc, id desc);
create index if not exists chat_conversations_ip_hash_idx
  on chat_conversations (ip_hash) where ip_hash is not null;
create index if not exists chat_conversations_device_idx
  on chat_conversations (device_type, last_activity_at desc);
create index if not exists chat_conversations_browser_idx
  on chat_conversations (browser_name, last_activity_at desc);
create index if not exists chat_conversations_bot_idx
  on chat_conversations (is_bot, last_activity_at desc);
create index if not exists chat_messages_created_idx
  on chat_messages (conversation_id, created_at, message_id);
create index if not exists chat_messages_search_idx
  on chat_messages using gin (to_tsvector('simple', content));
create index if not exists chat_requests_status_started_idx
  on chat_requests (status, started_at desc);
create index if not exists chat_requests_conversation_idx
  on chat_requests (conversation_id, started_at, id);
create index if not exists chat_telemetry_audit_occurred_idx
  on chat_telemetry_audit (occurred_at desc);

alter table chat_conversations enable row level security;
alter table chat_messages enable row level security;
alter table chat_requests enable row level security;
alter table chat_telemetry_audit enable row level security;
alter table chat_telemetry_retention_runs enable row level security;

revoke all on chat_conversations, chat_messages, chat_requests,
  chat_telemetry_audit, chat_telemetry_retention_runs from public, anon, authenticated;

grant select on chat_conversations to service_role;

create or replace function begin_chat_request(
  p_request_id uuid,
  p_conversation_id uuid,
  p_user_message_id text,
  p_user_content text,
  p_ip_hash text,
  p_ip_encrypted text,
  p_device_type text,
  p_is_bot boolean,
  p_os_name text,
  p_os_major text,
  p_browser_name text,
  p_browser_major text,
  p_preferred_language text,
  p_trace_id text,
  p_telemetry_write_ms integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into chat_conversations (
    id, ip_hash, ip_encrypted, device_type, is_bot, os_name, os_major,
    browser_name, browser_major, preferred_language
  ) values (
    p_conversation_id, p_ip_hash, p_ip_encrypted, p_device_type, p_is_bot,
    p_os_name, p_os_major, p_browser_name, p_browser_major, p_preferred_language
  )
  on conflict (id) do update set
    last_activity_at = now(),
    ip_hash = coalesce(chat_conversations.ip_hash, excluded.ip_hash),
    ip_encrypted = coalesce(chat_conversations.ip_encrypted, excluded.ip_encrypted);

  insert into chat_messages (conversation_id, message_id, role, content, status)
  values (p_conversation_id, p_user_message_id, 'user', p_user_content, 'complete')
  on conflict (conversation_id, message_id) do update set
    content = excluded.content,
    status = 'complete';

  insert into chat_requests (
    id, conversation_id, user_message_id, trace_id, telemetry_write_ms
  ) values (
    p_request_id, p_conversation_id, p_user_message_id, p_trace_id, p_telemetry_write_ms
  )
  on conflict (id) do nothing;

  return p_request_id;
end;
$$;

create or replace function record_chat_telemetry_write_ms(
  p_request_id uuid,
  p_telemetry_write_ms integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_telemetry_write_ms is null or p_telemetry_write_ms < 0 then
    raise exception 'invalid telemetry write duration';
  end if;

  update chat_requests
  set telemetry_write_ms = p_telemetry_write_ms
  where id = p_request_id;

  return found;
end;
$$;

create or replace function finish_chat_request(
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
  p_error_category text default null
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

  select conversation_id into v_conversation_id from chat_requests where id = p_request_id;
  if v_conversation_id is null then return false; end if;

  if p_assistant_message_id is not null and coalesce(p_assistant_content, '') <> '' then
    insert into chat_messages (
      conversation_id, message_id, role, content, status, sources
    ) values (
      v_conversation_id, p_assistant_message_id, 'assistant', p_assistant_content,
      case when p_message_status = 'partial' then 'partial' else 'complete' end,
      case when jsonb_typeof(p_sources) = 'array' then p_sources else '[]'::jsonb end
    )
    on conflict (conversation_id, message_id) do update set
      content = excluded.content,
      status = excluded.status,
      sources = excluded.sources;
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
    error_category = coalesce(error_category, p_error_category)
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
  ), retention as (
    select completed_at from chat_telemetry_retention_runs
    where status = 'completed' order by completed_at desc limit 1
  )
  select jsonb_build_object(
    'conversations', (select count(*) from conversations_in_range),
    'messages', (select count(*) from messages_in_range),
    'requests', (select count(*) from requests_in_range),
    'completed', (select count(*) from requests_in_range where status = 'completed'),
    'failed', (select count(*) from requests_in_range where status = 'failed'),
    'aborted', (select count(*) from requests_in_range where status = 'aborted'),
    'averageDurationMs', (select round(avg(duration_ms)) from requests_in_range where duration_ms is not null),
    'totalTokens', (select sum(total_tokens) from requests_in_range where total_tokens is not null),
    'devices', coalesce((select jsonb_agg(to_jsonb(device_counts) order by count desc) from device_counts), '[]'::jsonb),
    'browsers', coalesce((select jsonb_agg(to_jsonb(browser_counts) order by count desc) from browser_counts), '[]'::jsonb),
    'lastRetentionAt', (select completed_at from retention)
  );
$$;

create or replace function list_chat_conversations(
  p_from timestamptz,
  p_to timestamptz,
  p_limit integer default 25,
  p_cursor_at timestamptz default null,
  p_cursor_id uuid default null,
  p_status text default null,
  p_device_type text default null,
  p_browser_name text default null,
  p_is_bot boolean default null,
  p_ip_hash text default null,
  p_query text default null
)
returns table (
  id uuid,
  started_at timestamptz,
  last_activity_at timestamptz,
  device_type text,
  is_bot boolean,
  os_name text,
  os_major text,
  browser_name text,
  browser_major text,
  preferred_language text,
  ip_available boolean,
  message_count bigint,
  request_count bigint,
  last_status text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id, c.started_at, c.last_activity_at, c.device_type, c.is_bot,
    c.os_name, c.os_major, c.browser_name, c.browser_major, c.preferred_language,
    c.ip_encrypted is not null,
    (select count(*) from chat_messages m where m.conversation_id = c.id),
    (select count(*) from chat_requests r where r.conversation_id = c.id),
    (select r.status from chat_requests r where r.conversation_id = c.id order by r.started_at desc, r.id desc limit 1)
  from chat_conversations c
  where c.started_at >= p_from and c.started_at < p_to
    and (p_cursor_at is null or (c.last_activity_at, c.id) < (p_cursor_at, p_cursor_id))
    and (p_device_type is null or c.device_type = p_device_type)
    and (p_browser_name is null or c.browser_name = p_browser_name)
    and (p_is_bot is null or c.is_bot = p_is_bot)
    and (p_ip_hash is null or c.ip_hash = p_ip_hash)
    and (p_status is null or exists (
      select 1 from chat_requests r where r.conversation_id = c.id and r.status = p_status
    ))
    and (p_query is null or exists (
      select 1 from chat_messages m where m.conversation_id = c.id
        and to_tsvector('simple', m.content) @@ plainto_tsquery('simple', p_query)
    ))
  order by c.last_activity_at desc, c.id desc
  limit least(greatest(p_limit, 1), 100);
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
      'id', c.id,
      'startedAt', c.started_at,
      'lastActivityAt', c.last_activity_at,
      'deviceType', c.device_type,
      'isBot', c.is_bot,
      'osName', c.os_name,
      'osMajor', c.os_major,
      'browserName', c.browser_name,
      'browserMajor', c.browser_major,
      'preferredLanguage', c.preferred_language,
      'ipAvailable', c.ip_encrypted is not null
    ),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.message_id, 'role', m.role, 'content', m.content,
        'status', m.status, 'sources', m.sources, 'createdAt', m.created_at
      ) order by m.created_at, m.message_id)
      from chat_messages m where m.conversation_id = c.id
    ), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'userMessageId', r.user_message_id,
        'assistantMessageId', r.assistant_message_id, 'startedAt', r.started_at,
        'completedAt', r.completed_at, 'durationMs', r.duration_ms,
        'status', r.status, 'provider', r.provider, 'model', r.model,
        'finishReason', r.finish_reason, 'inputTokens', r.input_tokens,
        'outputTokens', r.output_tokens, 'totalTokens', r.total_tokens,
        'errorCategory', r.error_category
      ) order by r.started_at, r.id)
      from chat_requests r where r.conversation_id = c.id
    ), '[]'::jsonb)
  )
  from chat_conversations c where c.id = p_conversation_id;
$$;

create or replace function record_chat_telemetry_audit(
  p_action text,
  p_target_conversation_id uuid,
  p_outcome text,
  p_session_id text default 'shared-admin-session'
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into chat_telemetry_audit (action, target_conversation_id, session_id, outcome)
  values (p_action, p_target_conversation_id, p_session_id, p_outcome);
$$;

create or replace function delete_chat_conversation(p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted boolean;
begin
  delete from chat_conversations where id = p_conversation_id;
  v_deleted := found;
  insert into chat_telemetry_audit (action, target_conversation_id, outcome)
  values ('delete_conversation', p_conversation_id, case when v_deleted then 'deleted' else 'not_found' end);
  return v_deleted;
end;
$$;

create or replace function purge_chat_telemetry(
  p_ip_days integer default 7,
  p_conversation_days integer default 30,
  p_audit_days integer default 90
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_started_at timestamptz := now();
  v_ips integer;
  v_conversations integer;
  v_audits integer;
begin
  update chat_conversations set ip_encrypted = null
    where ip_encrypted is not null and started_at < now() - make_interval(days => p_ip_days);
  get diagnostics v_ips = row_count;

  delete from chat_conversations where started_at < now() - make_interval(days => p_conversation_days);
  get diagnostics v_conversations = row_count;

  delete from chat_telemetry_audit where occurred_at < now() - make_interval(days => p_audit_days);
  get diagnostics v_audits = row_count;

  insert into chat_telemetry_retention_runs (
    started_at, status, encrypted_ips_removed, conversations_removed, audits_removed
  ) values (v_started_at, 'completed', v_ips, v_conversations, v_audits);

  return jsonb_build_object(
    'encryptedIpsRemoved', v_ips,
    'conversationsRemoved', v_conversations,
    'auditsRemoved', v_audits
  );
end;
$$;

revoke all on function begin_chat_request(uuid, uuid, text, text, text, text, text, boolean, text, text, text, text, text, text, integer) from public, anon, authenticated;
revoke all on function record_chat_telemetry_write_ms(uuid, integer) from public, anon, authenticated;
revoke all on function finish_chat_request(uuid, text, text, text, text, jsonb, integer, text, text, text, integer, integer, integer, text) from public, anon, authenticated;
revoke all on function chat_observability_summary(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function list_chat_conversations(timestamptz, timestamptz, integer, timestamptz, uuid, text, text, text, boolean, text, text) from public, anon, authenticated;
revoke all on function get_chat_conversation(uuid) from public, anon, authenticated;
revoke all on function record_chat_telemetry_audit(text, uuid, text, text) from public, anon, authenticated;
revoke all on function delete_chat_conversation(uuid) from public, anon, authenticated;
revoke all on function purge_chat_telemetry(integer, integer, integer) from public, anon, authenticated;

grant execute on function begin_chat_request(uuid, uuid, text, text, text, text, text, boolean, text, text, text, text, text, text, integer) to service_role;
grant execute on function record_chat_telemetry_write_ms(uuid, integer) to service_role;
grant execute on function finish_chat_request(uuid, text, text, text, text, jsonb, integer, text, text, text, integer, integer, integer, text) to service_role;
grant execute on function chat_observability_summary(timestamptz, timestamptz) to service_role;
grant execute on function list_chat_conversations(timestamptz, timestamptz, integer, timestamptz, uuid, text, text, text, boolean, text, text) to service_role;
grant execute on function get_chat_conversation(uuid) to service_role;
grant execute on function record_chat_telemetry_audit(text, uuid, text, text) to service_role;
grant execute on function delete_chat_conversation(uuid) to service_role;
grant execute on function purge_chat_telemetry(integer, integer, integer) to service_role;

insert into schema_migrations (name)
values ('0005_chat_observability')
on conflict (name) do nothing;

