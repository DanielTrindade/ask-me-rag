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
