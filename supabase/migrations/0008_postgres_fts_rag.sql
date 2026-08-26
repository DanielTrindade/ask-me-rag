-- Migration 0008: PostgreSQL Full-Text Search for RAG retrieval.
--
-- Expand-only by design: the vector column, HNSW index, match_documents RPC,
-- and embedding cache remain available until the FTS revision has been fully
-- promoted and its rollback window has ended.

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
