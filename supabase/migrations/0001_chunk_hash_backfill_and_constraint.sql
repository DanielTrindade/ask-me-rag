-- Migration 0001: chunk_hash backfill + unique guarantee + source index
--
-- Re-runnable (idempotent). Records a clear marker in `schema_migrations` so we
-- can tell which databases have applied it.
--
-- Order matters: backfill FIRST so legacy rows get a chunk_hash, then dedup so the
-- unique index added next does not fail on a dirty database.

-- pgcrypto provides digest() used to compute the SHA-256 hash in SQL.
create extension if not exists pgcrypto;

-- On Supabase, pgcrypto lives in the `extensions` schema, which is on the SQL
-- Editor's search_path but NOT on the CLI/migration connection's. Include it
-- so digest() resolves regardless of where the extension was installed.
set search_path = public, extensions;

-- 1. Backfill chunk_hash for rows ingested before the dedup change.
--    Hash formula mirrors the JS helper: sha256(source + '::' + content).
--    A null source legacy row coalesces to '' for parity with selectFresh
--    (which always receives a non-null filename, but legacy rows may lack one).
update documents
set metadata = jsonb_set(
  metadata,
  '{chunk_hash}'::text[],
  to_jsonb(
    encode(
      digest(coalesce(metadata->>'source', '') || '::' || content, 'sha256'),
      'hex'
    )
  )
)
where metadata->>'chunk_hash' is null;

-- 2. Remove pre-existing duplicate chunk_hash rows (keep the earliest by id).
--    Tolerates dirty data so the unique index added next does not fail.
delete from documents d
where d.id <> (
  select min(m.id)
  from documents m
  where m.metadata->>'chunk_hash' = d.metadata->>'chunk_hash'
);

-- 3. Declarative dedup: collide at insert time instead of racing.
--    Supabase-js surfaces a Postgres 23505 unique_violation, handled by the
--    ingest route as "already present" → { inserted: 0, skipped: n }.
create unique index if not exists documents_chunk_hash_uidx
  on documents ((metadata->>'chunk_hash'));

-- 4. Btree expression index on source so the dedup lookup stays sublinear as
--    the knowledge base grows.
create index if not exists documents_metadata_source_idx
  on documents ((metadata->>'source'));

-- 5. Marker so we know which databases have been migrated.
create table if not exists schema_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);

insert into schema_migrations (name)
values ('0001_chunk_hash_backfill_and_constraint')
on conflict (name) do nothing;