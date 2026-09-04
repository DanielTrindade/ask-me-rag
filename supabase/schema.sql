-- Enable pgvector
create extension if not exists vector;

-- Documents table (one row per chunk)
create table if not exists documents (
  id bigint generated always as identity primary key,
  content text not null,
  embedding vector(1536),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- ANN index for cosine similarity
create index if not exists documents_embedding_idx
  on documents using hnsw (embedding vector_cosine_ops);

-- Row Level Security: defense-in-depth so that, if the anon/public key is ever
-- introduced into a client bundle, anonymous requests cannot read or write
-- documents. The server edge uses the service role (which bypasses RLS) by
-- design; this policy ensures least privilege for any future browser client.
alter table documents enable row level security;
-- Postgres has no 'create policy if not exists'; guard so this file stays
-- fully re-runnable like everything else in it.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'documents'
      and policyname = 'no_anon_access_documents'
  ) then
    create policy "no_anon_access_documents" on documents
      for all
      using (auth.role() = 'authenticated')
      with check (auth.role() = 'authenticated');
  end if;
end $$;

-- Similarity search function
create or replace function match_documents (
  query_embedding vector(1536),
  match_count int default 5,
  match_threshold float default 0.3
)
returns table (
  id bigint,
  content text,
  metadata jsonb,
  similarity float
)
language sql stable
as $$
  select
    documents.id,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where 1 - (documents.embedding <=> query_embedding) > match_threshold
  order by documents.embedding <=> query_embedding
  limit match_count;
$$;

-- Lists indexed documents grouped by source file, for the admin panel.
create or replace function list_document_sources()
returns table (
  source text,
  chunk_count bigint,
  last_ingested_at timestamptz
)
language sql stable
as $$
  select
    documents.metadata->>'source' as source,
    count(*) as chunk_count,
    max(documents.created_at) as last_ingested_at
  from documents
  group by 1
  order by 3 desc;
$$;

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
create unique index if not exists chat_requests_conversation_user_message_uidx
  on chat_requests (conversation_id, user_message_id);
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
declare
  v_request_id uuid;
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
  on conflict (conversation_id, user_message_id) do update set
    user_message_id = excluded.user_message_id
  returning id into v_request_id;

  return v_request_id;
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

-- Migration 0006: persistent chat admission, leases and exact caches.
-- Expand-only and idempotent so existing chat observability remains available.

create table if not exists chat_usage_buckets (
  scope text not null check (scope in ('global', 'visitor')),
  bucket_key text not null check (char_length(bucket_key) between 1 and 256),
  window_kind text not null check (window_kind in ('minute', 'day')),
  window_start timestamptz not null,
  window_end timestamptz not null,
  admitted_count integer not null default 0 check (admitted_count >= 0),
  blocked_count integer not null default 0 check (blocked_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (scope, bucket_key, window_kind, window_start),
  check (window_end > window_start),
  check (
    (scope = 'global' and window_kind = 'day' and bucket_key = 'global')
    or scope = 'visitor'
  )
);

create table if not exists chat_generation_reservations (
  request_id uuid primary key,
  conversation_id uuid not null,
  message_id text not null check (char_length(message_id) between 1 and 128),
  visitor_key text check (visitor_key is null or char_length(visitor_key) between 1 and 256),
  decision text not null check (
    decision in ('allowed', 'visitor_limited', 'global_limited', 'conversation_busy', 'disabled')
  ),
  status text not null check (
    status in ('reserved', 'completed', 'failed', 'aborted', 'timed_out', 'denied')
  ),
  reserved_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  finalized_at timestamptz,
  reset_at timestamptz,
  unique (conversation_id, message_id),
  check ((status = 'reserved') = (lease_expires_at is not null)),
  check (lease_expires_at is null or lease_expires_at > reserved_at),
  check ((status in ('reserved', 'denied')) = (finalized_at is null))
);

create unique index if not exists chat_generation_active_conversation_uidx
  on chat_generation_reservations (conversation_id)
  where status = 'reserved';
create index if not exists chat_generation_lease_expiry_idx
  on chat_generation_reservations (lease_expires_at)
  where status = 'reserved';
create index if not exists chat_generation_finalized_idx
  on chat_generation_reservations (finalized_at)
  where finalized_at is not null;
create index if not exists chat_usage_buckets_expiry_idx
  on chat_usage_buckets (window_end);

create table if not exists chat_response_cache (
  cache_key text primary key check (char_length(cache_key) between 32 and 128),
  question_hash text not null check (char_length(question_hash) between 32 and 128),
  locale text not null check (char_length(locale) between 2 and 16),
  provider text not null check (char_length(provider) between 1 and 64),
  model text not null check (char_length(model) between 1 and 128),
  prompt_revision text not null check (char_length(prompt_revision) between 1 and 64),
  knowledge_revision bigint not null check (knowledge_revision >= 0),
  response_text text not null check (char_length(response_text) > 0),
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  hit_count bigint not null default 0 check (hit_count >= 0),
  unique (question_hash, locale, provider, model, prompt_revision, knowledge_revision),
  check (expires_at > created_at)
);

create index if not exists chat_response_cache_expiry_idx
  on chat_response_cache (expires_at);

create table if not exists chat_embedding_cache (
  cache_key text primary key check (char_length(cache_key) between 32 and 128),
  input_hash text not null check (char_length(input_hash) between 32 and 128),
  provider text not null check (char_length(provider) between 1 and 64),
  model text not null check (char_length(model) between 1 and 128),
  dimension integer not null check (dimension = 1536),
  purpose text not null check (purpose in ('query', 'document')),
  embedding vector(1536) not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  hit_count bigint not null default 0 check (hit_count >= 0),
  unique (input_hash, provider, model, dimension, purpose),
  check (expires_at > created_at)
);

create index if not exists chat_embedding_cache_expiry_idx
  on chat_embedding_cache (expires_at);

create table if not exists chat_knowledge_revision (
  singleton boolean primary key default true check (singleton),
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

insert into chat_knowledge_revision (singleton, revision)
values (true, 0)
on conflict (singleton) do nothing;

alter table chat_usage_buckets enable row level security;
alter table chat_generation_reservations enable row level security;
alter table chat_response_cache enable row level security;
alter table chat_embedding_cache enable row level security;
alter table chat_knowledge_revision enable row level security;

revoke all on chat_usage_buckets, chat_generation_reservations,
  chat_response_cache, chat_embedding_cache, chat_knowledge_revision
  from public, anon, authenticated, service_role;

create or replace function reserve_chat_generation(
  p_request_id uuid,
  p_conversation_id uuid,
  p_message_id text,
  p_visitor_key text,
  p_disabled boolean,
  p_visitor_minute_limit integer,
  p_visitor_daily_limit integer,
  p_global_daily_limit integer,
  p_operational_reserve integer,
  p_reset_time_zone text,
  p_lease_ttl_seconds integer,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing chat_generation_reservations%rowtype;
  v_active_lease timestamptz;
  v_minute_start timestamptz;
  v_minute_end timestamptz;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_local_day date;
  v_global_count integer;
  v_visitor_day_count integer := 0;
  v_visitor_minute_count integer := 0;
  v_public_global_limit integer;
  v_lease_expires_at timestamptz;
begin
  if p_message_id is null or char_length(p_message_id) not between 1 and 128 then
    raise exception 'invalid message id';
  end if;
  if p_visitor_minute_limit <= 0 or p_visitor_daily_limit <= 0
    or p_global_daily_limit <= 0 or p_operational_reserve < 0
    or p_operational_reserve >= p_global_daily_limit
    or p_lease_ttl_seconds not between 30 and 900 then
    raise exception 'invalid admission limits';
  end if;

  -- Validates the IANA zone and calculates UTC instants for the provider-local day.
  v_local_day := (p_now at time zone p_reset_time_zone)::date;
  v_day_start := v_local_day::timestamp at time zone p_reset_time_zone;
  v_day_end := (v_local_day + 1)::timestamp at time zone p_reset_time_zone;
  v_minute_start := date_trunc('minute', p_now at time zone 'UTC') at time zone 'UTC';
  v_minute_end := v_minute_start + interval '1 minute';
  v_public_global_limit := p_global_daily_limit - p_operational_reserve;

  -- Serializes admission for a conversation even before its first row exists.
  perform pg_advisory_xact_lock(hashtextextended(p_conversation_id::text, 0));

  select * into v_existing
  from chat_generation_reservations
  where conversation_id = p_conversation_id and message_id = p_message_id;
  if found then
    return jsonb_build_object(
      'decision', 'duplicate',
      'originalDecision', v_existing.decision,
      'requestId', v_existing.request_id,
      'status', v_existing.status,
      'leaseExpiresAt', v_existing.lease_expires_at,
      'resetAt', v_existing.reset_at
    );
  end if;

  if p_disabled then
    insert into chat_generation_reservations (
      request_id, conversation_id, message_id, visitor_key, decision, status,
      reserved_at
    ) values (
      p_request_id, p_conversation_id, p_message_id, p_visitor_key, 'disabled', 'denied', p_now
    );
    return jsonb_build_object('decision', 'disabled', 'requestId', p_request_id);
  end if;

  update chat_generation_reservations
  set status = 'timed_out', lease_expires_at = null, finalized_at = p_now
  where conversation_id = p_conversation_id
    and status = 'reserved' and lease_expires_at <= p_now;

  select lease_expires_at into v_active_lease
  from chat_generation_reservations
  where conversation_id = p_conversation_id and status = 'reserved'
  limit 1;
  if found then
    insert into chat_generation_reservations (
      request_id, conversation_id, message_id, visitor_key, decision, status,
      reserved_at, reset_at
    ) values (
      p_request_id, p_conversation_id, p_message_id, p_visitor_key,
      'conversation_busy', 'denied', p_now, v_active_lease
    );
    return jsonb_build_object(
      'decision', 'conversation_busy', 'requestId', p_request_id, 'resetAt', v_active_lease
    );
  end if;

  -- Global is always locked first so concurrent calls cannot oversubscribe the last slot.
  insert into chat_usage_buckets (
    scope, bucket_key, window_kind, window_start, window_end
  ) values ('global', 'global', 'day', v_day_start, v_day_end)
  on conflict do nothing;
  select admitted_count into v_global_count
  from chat_usage_buckets
  where scope = 'global' and bucket_key = 'global'
    and window_kind = 'day' and window_start = v_day_start
  for update;

  if p_visitor_key is not null then
    insert into chat_usage_buckets (
      scope, bucket_key, window_kind, window_start, window_end
    ) values
      ('visitor', p_visitor_key, 'day', v_day_start, v_day_end),
      ('visitor', p_visitor_key, 'minute', v_minute_start, v_minute_end)
    on conflict do nothing;

    select admitted_count into v_visitor_day_count
    from chat_usage_buckets
    where scope = 'visitor' and bucket_key = p_visitor_key
      and window_kind = 'day' and window_start = v_day_start
    for update;
    select admitted_count into v_visitor_minute_count
    from chat_usage_buckets
    where scope = 'visitor' and bucket_key = p_visitor_key
      and window_kind = 'minute' and window_start = v_minute_start
    for update;
  end if;

  if p_visitor_key is not null and v_visitor_minute_count >= p_visitor_minute_limit then
    update chat_usage_buckets set blocked_count = blocked_count + 1, updated_at = p_now
    where scope = 'visitor' and bucket_key = p_visitor_key
      and window_kind = 'minute' and window_start = v_minute_start;
    insert into chat_generation_reservations (
      request_id, conversation_id, message_id, visitor_key, decision, status,
      reserved_at, reset_at
    ) values (
      p_request_id, p_conversation_id, p_message_id, p_visitor_key,
      'visitor_limited', 'denied', p_now, v_minute_end
    );
    return jsonb_build_object(
      'decision', 'visitor_limited', 'requestId', p_request_id, 'resetAt', v_minute_end
    );
  end if;

  if p_visitor_key is not null and v_visitor_day_count >= p_visitor_daily_limit then
    update chat_usage_buckets set blocked_count = blocked_count + 1, updated_at = p_now
    where scope = 'visitor' and bucket_key = p_visitor_key
      and window_kind = 'day' and window_start = v_day_start;
    insert into chat_generation_reservations (
      request_id, conversation_id, message_id, visitor_key, decision, status,
      reserved_at, reset_at
    ) values (
      p_request_id, p_conversation_id, p_message_id, p_visitor_key,
      'visitor_limited', 'denied', p_now, v_day_end
    );
    return jsonb_build_object(
      'decision', 'visitor_limited', 'requestId', p_request_id, 'resetAt', v_day_end
    );
  end if;

  if v_global_count >= v_public_global_limit then
    update chat_usage_buckets set blocked_count = blocked_count + 1, updated_at = p_now
    where scope = 'global' and bucket_key = 'global'
      and window_kind = 'day' and window_start = v_day_start;
    insert into chat_generation_reservations (
      request_id, conversation_id, message_id, visitor_key, decision, status,
      reserved_at, reset_at
    ) values (
      p_request_id, p_conversation_id, p_message_id, p_visitor_key,
      'global_limited', 'denied', p_now, v_day_end
    );
    return jsonb_build_object(
      'decision', 'global_limited', 'requestId', p_request_id, 'resetAt', v_day_end
    );
  end if;

  update chat_usage_buckets
  set admitted_count = admitted_count + 1, updated_at = p_now
  where scope = 'global' and bucket_key = 'global'
    and window_kind = 'day' and window_start = v_day_start;
  if p_visitor_key is not null then
    update chat_usage_buckets
    set admitted_count = admitted_count + 1, updated_at = p_now
    where scope = 'visitor' and bucket_key = p_visitor_key
      and window_kind = 'day' and window_start = v_day_start;
    update chat_usage_buckets
    set admitted_count = admitted_count + 1, updated_at = p_now
    where scope = 'visitor' and bucket_key = p_visitor_key
      and window_kind = 'minute' and window_start = v_minute_start;
  end if;

  v_lease_expires_at := p_now + make_interval(secs => p_lease_ttl_seconds);
  insert into chat_generation_reservations (
    request_id, conversation_id, message_id, visitor_key, decision, status,
    reserved_at, lease_expires_at, reset_at
  ) values (
    p_request_id, p_conversation_id, p_message_id, p_visitor_key,
    'allowed', 'reserved', p_now, v_lease_expires_at, v_day_end
  );
  return jsonb_build_object(
    'decision', 'allowed',
    'requestId', p_request_id,
    'leaseExpiresAt', v_lease_expires_at,
    'resetAt', v_day_end
  );
end;
$$;

create or replace function finalize_chat_generation(
  p_request_id uuid,
  p_status text,
  p_now timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('completed', 'failed', 'aborted', 'timed_out') then
    raise exception 'invalid terminal status';
  end if;
  update chat_generation_reservations
  set status = p_status, lease_expires_at = null, finalized_at = p_now
  where request_id = p_request_id and status = 'reserved';
  if found then return true; end if;
  return exists(select 1 from chat_generation_reservations where request_id = p_request_id);
end;
$$;

create or replace function recover_expired_chat_generation_leases(
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recovered integer;
begin
  update chat_generation_reservations
  set status = 'timed_out', lease_expires_at = null, finalized_at = p_now
  where status = 'reserved' and lease_expires_at <= p_now;
  get diagnostics v_recovered = row_count;
  return v_recovered;
end;
$$;

create or replace function read_chat_daily_budget(
  p_visitor_key text,
  p_reset_time_zone text,
  p_global_daily_limit integer,
  p_operational_reserve integer,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_local_day date;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_global_used integer;
  v_visitor_used integer;
begin
  v_local_day := (p_now at time zone p_reset_time_zone)::date;
  v_day_start := v_local_day::timestamp at time zone p_reset_time_zone;
  v_day_end := (v_local_day + 1)::timestamp at time zone p_reset_time_zone;
  select admitted_count into v_global_used from chat_usage_buckets
  where scope = 'global' and bucket_key = 'global'
    and window_kind = 'day' and window_start = v_day_start;
  if p_visitor_key is not null then
    select admitted_count into v_visitor_used from chat_usage_buckets
    where scope = 'visitor' and bucket_key = p_visitor_key
      and window_kind = 'day' and window_start = v_day_start;
  end if;
  return jsonb_build_object(
    'globalUsed', coalesce(v_global_used, 0),
    'globalLimit', p_global_daily_limit - p_operational_reserve,
    'visitorUsed', case when p_visitor_key is null then null else coalesce(v_visitor_used, 0) end,
    'resetAt', v_day_end
  );
end;
$$;

create or replace function get_chat_response_cache(
  p_cache_key text,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry chat_response_cache%rowtype;
begin
  select * into v_entry from chat_response_cache
  where cache_key = p_cache_key and expires_at > p_now
  for update;
  if not found then return null; end if;
  update chat_response_cache set hit_count = hit_count + 1 where cache_key = p_cache_key;
  return jsonb_build_object(
    'responseText', v_entry.response_text,
    'sources', v_entry.sources,
    'provider', v_entry.provider,
    'model', v_entry.model,
    'expiresAt', v_entry.expires_at
  );
end;
$$;

create or replace function put_chat_response_cache(
  p_cache_key text,
  p_question_hash text,
  p_locale text,
  p_provider text,
  p_model text,
  p_prompt_revision text,
  p_knowledge_revision bigint,
  p_response_text text,
  p_sources jsonb,
  p_expires_at timestamptz,
  p_now timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_expires_at <= p_now or jsonb_typeof(p_sources) <> 'array' then
    raise exception 'invalid response cache entry';
  end if;
  insert into chat_response_cache (
    cache_key, question_hash, locale, provider, model, prompt_revision,
    knowledge_revision, response_text, sources, created_at, expires_at
  ) values (
    p_cache_key, p_question_hash, p_locale, p_provider, p_model, p_prompt_revision,
    p_knowledge_revision, p_response_text, p_sources, p_now, p_expires_at
  )
  on conflict (cache_key) do update set
    response_text = excluded.response_text,
    sources = excluded.sources,
    created_at = excluded.created_at,
    expires_at = excluded.expires_at,
    hit_count = 0;
end;
$$;

create or replace function get_chat_embedding_cache(
  p_cache_key text,
  p_now timestamptz default now()
)
returns vector(1536)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_embedding vector(1536);
begin
  select embedding into v_embedding from chat_embedding_cache
  where cache_key = p_cache_key and expires_at > p_now
  for update;
  if found then
    update chat_embedding_cache set hit_count = hit_count + 1 where cache_key = p_cache_key;
  end if;
  return v_embedding;
end;
$$;

create or replace function put_chat_embedding_cache(
  p_cache_key text,
  p_input_hash text,
  p_provider text,
  p_model text,
  p_dimension integer,
  p_purpose text,
  p_embedding vector(1536),
  p_expires_at timestamptz,
  p_now timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_dimension <> 1536 or p_expires_at <= p_now then
    raise exception 'invalid embedding cache entry';
  end if;
  insert into chat_embedding_cache (
    cache_key, input_hash, provider, model, dimension, purpose,
    embedding, created_at, expires_at
  ) values (
    p_cache_key, p_input_hash, p_provider, p_model, p_dimension, p_purpose,
    p_embedding, p_now, p_expires_at
  )
  on conflict (cache_key) do update set
    embedding = excluded.embedding,
    created_at = excluded.created_at,
    expires_at = excluded.expires_at,
    hit_count = 0;
end;
$$;

create or replace function get_chat_knowledge_revision()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select revision from chat_knowledge_revision where singleton = true;
$$;

create or replace function increment_chat_knowledge_revision()
returns bigint
language sql
security definer
set search_path = public
as $$
  update chat_knowledge_revision
  set revision = revision + 1, updated_at = now()
  where singleton = true
  returning revision;
$$;

create or replace function purge_chat_usage_governance(
  p_now timestamptz default now(),
  p_reservation_retention_days integer default 7
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_leases integer;
  v_reservations integer;
  v_response_cache integer;
  v_embedding_cache integer;
  v_buckets integer;
begin
  if p_reservation_retention_days not between 1 and 90 then
    raise exception 'invalid reservation retention';
  end if;
  update chat_generation_reservations
  set status = 'timed_out', lease_expires_at = null, finalized_at = p_now
  where status = 'reserved' and lease_expires_at <= p_now;
  get diagnostics v_leases = row_count;
  delete from chat_generation_reservations
  where status <> 'reserved'
    and coalesce(finalized_at, reserved_at) < p_now - make_interval(days => p_reservation_retention_days);
  get diagnostics v_reservations = row_count;
  delete from chat_response_cache where expires_at <= p_now;
  get diagnostics v_response_cache = row_count;
  delete from chat_embedding_cache where expires_at <= p_now;
  get diagnostics v_embedding_cache = row_count;
  delete from chat_usage_buckets where window_end < p_now - interval '2 days';
  get diagnostics v_buckets = row_count;
  return jsonb_build_object(
    'leasesRecovered', v_leases,
    'reservationsRemoved', v_reservations,
    'responseCacheRemoved', v_response_cache,
    'embeddingCacheRemoved', v_embedding_cache,
    'bucketsRemoved', v_buckets
  );
end;
$$;

revoke all on function reserve_chat_generation(uuid, uuid, text, text, boolean, integer, integer, integer, integer, text, integer, timestamptz) from public, anon, authenticated;
revoke all on function finalize_chat_generation(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function recover_expired_chat_generation_leases(timestamptz) from public, anon, authenticated;
revoke all on function read_chat_daily_budget(text, text, integer, integer, timestamptz) from public, anon, authenticated;
revoke all on function get_chat_response_cache(text, timestamptz) from public, anon, authenticated;
revoke all on function put_chat_response_cache(text, text, text, text, text, text, bigint, text, jsonb, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function get_chat_embedding_cache(text, timestamptz) from public, anon, authenticated;
revoke all on function put_chat_embedding_cache(text, text, text, text, integer, text, vector, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function get_chat_knowledge_revision() from public, anon, authenticated;
revoke all on function increment_chat_knowledge_revision() from public, anon, authenticated;
revoke all on function purge_chat_usage_governance(timestamptz, integer) from public, anon, authenticated;

grant execute on function reserve_chat_generation(uuid, uuid, text, text, boolean, integer, integer, integer, integer, text, integer, timestamptz) to service_role;
grant execute on function finalize_chat_generation(uuid, text, timestamptz) to service_role;
grant execute on function recover_expired_chat_generation_leases(timestamptz) to service_role;
grant execute on function read_chat_daily_budget(text, text, integer, integer, timestamptz) to service_role;
grant execute on function get_chat_response_cache(text, timestamptz) to service_role;
grant execute on function put_chat_response_cache(text, text, text, text, text, text, bigint, text, jsonb, timestamptz, timestamptz) to service_role;
grant execute on function get_chat_embedding_cache(text, timestamptz) to service_role;
grant execute on function put_chat_embedding_cache(text, text, text, text, integer, text, vector, timestamptz, timestamptz) to service_role;
grant execute on function get_chat_knowledge_revision() to service_role;
grant execute on function increment_chat_knowledge_revision() to service_role;
grant execute on function purge_chat_usage_governance(timestamptz, integer) to service_role;

-- Chat usage metrics (migration 0007); tentativas do provider ampliadas para 0..5 na migração 0010
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
    check (provider_attempts >= 0 and provider_attempts <= 5);
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

-- PostgreSQL Full-Text Search RAG (migration 0008, expand phase)
create schema if not exists extensions;
create extension if not exists unaccent with schema extensions;

set search_path = public, extensions;

alter table documents
  add column if not exists search_vector tsvector;

create or replace function update_document_search_vector()
returns trigger
language plpgsql
set search_path = public, extensions, pg_catalog
as $$
declare
  normalized_content text;
begin
  normalized_content := unaccent(coalesce(new.content, ''));
  new.search_vector :=
    to_tsvector('pg_catalog.portuguese', normalized_content) ||
    to_tsvector('pg_catalog.english', normalized_content);
  return new;
end;
$$;

drop trigger if exists documents_search_vector_update on documents;
create trigger documents_search_vector_update
before insert or update of content on documents
for each row execute function update_document_search_vector();

update documents
set search_vector =
  to_tsvector('pg_catalog.portuguese', unaccent(coalesce(content, ''))) ||
  to_tsvector('pg_catalog.english', unaccent(coalesce(content, '')))
where search_vector is null;

alter table documents
  alter column search_vector set not null;

create index if not exists documents_search_vector_idx
  on documents using gin (search_vector);

create or replace function search_documents(
  query_text text,
  query_language text,
  match_count integer
)
returns table (
  id bigint,
  content text,
  metadata jsonb,
  rank double precision
)
language plpgsql
stable
security invoker
set search_path = public, extensions, pg_catalog
as $$
declare
  search_config regconfig;
  parsed_query tsquery;
  result_limit integer;
begin
  if query_text is null or btrim(query_text) = '' then
    return;
  end if;

  search_config := case lower(coalesce(query_language, 'portuguese'))
    when 'english' then 'pg_catalog.english'::regconfig
    else 'pg_catalog.portuguese'::regconfig
  end;
  parsed_query := websearch_to_tsquery(search_config, unaccent(query_text));

  if numnode(parsed_query) = 0 then
    return;
  end if;

  result_limit := greatest(1, least(coalesce(match_count, 5), 8));

  return query
  select
    documents.id,
    documents.content,
    documents.metadata,
    ts_rank_cd(documents.search_vector, parsed_query, 32)::double precision as rank
  from documents
  where documents.search_vector @@ parsed_query
  order by
    ts_rank_cd(documents.search_vector, parsed_query, 32) desc,
    documents.id
  limit result_limit;
end;
$$;

revoke all on function update_document_search_vector() from public, anon, authenticated;
revoke all on function search_documents(text, text, integer) from public, anon, authenticated;
grant execute on function search_documents(text, text, integer) to service_role;

insert into schema_migrations (name)
values ('0008_postgres_fts_rag')
on conflict (name) do nothing;

-- Refined PostgreSQL Full-Text Search RAG (migration 0009, expand phase)
create or replace function search_documents_v2(
  query_text text,
  query_expansion text,
  query_language text,
  match_count integer
)
returns table (
  id bigint,
  content text,
  metadata jsonb,
  rank double precision
)
language plpgsql
stable
security invoker
set search_path = public, extensions, pg_catalog
as $$
declare
  search_config regconfig;
  strict_query tsquery;
  original_terms text[];
  expansion_terms text[];
  relaxed_terms text[];
  relaxed_query tsquery;
  result_limit integer;
begin
  if query_text is null or btrim(query_text) = '' then
    return;
  end if;

  search_config := case lower(coalesce(query_language, 'portuguese'))
    when 'english' then 'pg_catalog.english'::regconfig
    else 'pg_catalog.portuguese'::regconfig
  end;

  strict_query := websearch_to_tsquery(search_config, unaccent(query_text));
  original_terms := tsvector_to_array(
    to_tsvector(search_config, unaccent(query_text))
  );
  expansion_terms := tsvector_to_array(
    to_tsvector(
      search_config,
      unaccent(coalesce(query_expansion, ''))
    )
  );

  select coalesce(array_agg(distinct term order by term), array[]::text[])
  into relaxed_terms
  from unnest(original_terms || expansion_terms) as term;

  if cardinality(relaxed_terms) = 0 then
    return;
  end if;

  select to_tsquery(
    search_config,
    string_agg(quote_literal(term), ' | ' order by term)
  )
  into relaxed_query
  from unnest(relaxed_terms) as term;

  if relaxed_query is null or numnode(relaxed_query) = 0 then
    return;
  end if;

  result_limit := greatest(1, least(coalesce(match_count, 5), 8));

  return query
  with ranked_documents as (
    select
      documents.id,
      documents.content,
      documents.metadata,
      ts_rank_cd(documents.search_vector, relaxed_query, 32)::double precision
        as lexical_rank,
      case
        when numnode(strict_query) > 0 and documents.search_vector @@ strict_query then 2.0
        else 0.0
      end as strict_bonus,
      (
        select count(*)::double precision
        from unnest(original_terms) as original_term
        where original_term = any(tsvector_to_array(documents.search_vector))
      ) / greatest(cardinality(original_terms), 1) as original_coverage,
      (
        select count(*)::double precision
        from unnest(expansion_terms) as expanded_term
        where expanded_term = any(tsvector_to_array(documents.search_vector))
      ) / greatest(cardinality(expansion_terms), 1) as expansion_coverage
    from documents
    where documents.search_vector @@ relaxed_query
  )
  select
    ranked_documents.id,
    ranked_documents.content,
    ranked_documents.metadata,
    (
      ranked_documents.strict_bonus
      + ranked_documents.original_coverage
      + (0.75 * ranked_documents.expansion_coverage)
      + ranked_documents.lexical_rank
    )::double precision as rank
  from ranked_documents
  order by rank desc, ranked_documents.id
  limit result_limit;
end;
$$;

revoke all on function search_documents_v2(text, text, text, integer)
  from public, anon, authenticated;
grant execute on function search_documents_v2(text, text, text, integer)
  to service_role;

insert into schema_migrations (name)
values ('0009_refine_postgres_fts_rag')
on conflict (name) do nothing;
