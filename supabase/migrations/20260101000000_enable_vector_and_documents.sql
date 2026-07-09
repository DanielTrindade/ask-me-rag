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

-- Enable RLS (defense in depth): blocks the anon/anon key if it ever leaks.
-- service_role bypasses RLS, so the server app (using SUPABASE_SERVICE_ROLE_KEY)
-- can read/write freely without needing explicit policies.
alter table documents enable row level security;

-- Explicit grants to the two platform roles.
-- service_role: full access (bypasses RLS) — used by the app's server code.
-- anon/authenticated: no access; the app never uses these keys server-side.
grant all on table documents to service_role;
grant execute on function match_documents to service_role;
revoke all on table documents from anon, authenticated;
revoke execute on function match_documents from anon, authenticated;
