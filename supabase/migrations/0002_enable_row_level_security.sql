-- Migration 0002: enable row level security (defense-in-depth)
--
-- Re-runnable (idempotent). Mirrors the RLS statements now present in
-- supabase/schema.sql so databases created before this change also get the
-- protection. The server edge uses the service role (which bypasses RLS); these
-- policies ensure that, if the anon/public key is ever introduced into a client
-- bundle, anonymous requests cannot read or write these tables.

-- documents: no anon/public access; only the authenticated/service role path.
alter table documents enable row level security;
-- 'create policy ... on conflict do nothing' isn't supported; guard with a check.
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

-- schema_migrations: internal bookkeeping, no anon/public access.
alter table schema_migrations enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'schema_migrations'
      and policyname = 'no_anon_access_schema_migrations'
  ) then
    create policy "no_anon_access_schema_migrations" on schema_migrations
      for all
      using (auth.role() = 'authenticated')
      with check (auth.role() = 'authenticated');
  end if;
end $$;

insert into schema_migrations (name)
values ('0002_enable_row_level_security')
on conflict (name) do nothing;