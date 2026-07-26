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

insert into schema_migrations (name)
values ('0006_chat_usage_governance')
on conflict (name) do nothing;
