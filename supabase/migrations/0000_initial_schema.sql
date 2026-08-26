-- Migration 0000: reproducible baseline for a fresh database.
--
-- This migration is intentionally idempotent because existing production
-- databases were originally bootstrapped from supabase/schema.sql before the
-- migration workflow was introduced.

create extension if not exists vector;

create table if not exists documents (
  id bigint generated always as identity primary key,
  content text not null,
  embedding vector(1536),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Defense-in-depth: block anon/public access even if the public key ever
-- leaks into a client bundle. The server edge uses the service role, which
-- bypasses RLS. The matching policy is added by migration 0002.
alter table documents enable row level security;

create index if not exists documents_embedding_idx
  on documents using hnsw (embedding vector_cosine_ops);

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

