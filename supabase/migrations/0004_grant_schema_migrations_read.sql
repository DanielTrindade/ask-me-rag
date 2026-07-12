-- Migration 0004: allow the health check to read schema_migrations
--
-- Re-runnable (idempotent). The table was created by migration 0001 without
-- table-level grants, so PostgREST returns 42501 (permission denied) for the
-- service role and /api/health always reports 503 — which blocks the deploy
-- smoke test. RLS from migration 0002 stays in effect for anon clients.
grant select on table public.schema_migrations to service_role;

insert into schema_migrations (name)
values ('0004_grant_schema_migrations_read')
on conflict (name) do nothing;
