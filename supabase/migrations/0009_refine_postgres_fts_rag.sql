-- Migration 0009: improve lexical RAG recall without reintroducing embeddings.
--
-- Expand-only by design: search_documents v1 remains available for the
-- previous Cloud Run revision while v2 adds deterministic query expansion,
-- relaxed OR matching, and multi-signal ranking.

set search_path = public, extensions;

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
