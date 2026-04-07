-- Sprint 2 (Module 13.2): AI vector search foundation
-- Includes:
-- 1) pgvector extension
-- 2) destinations.embedding vector(384)
-- 3) RPC function: match_destinations
-- 4) IVFFlat cosine index for similarity search

create extension if not exists vector with schema extensions;

alter table public.destinations
  add column if not exists embedding vector(384);

comment on column public.destinations.embedding is
  'Vector embedding (384 dims) for semantic similarity search.';

create or replace function public.match_destinations(
  query_embedding vector(384),
  match_threshold float,
  match_count int
)
returns table (
  id text,
  name text,
  location text,
  image_url text,
  rating double precision,
  price text,
  similarity double precision
)
language sql
stable
as $$
  select
    d.id::text as id,
    d.name,
    d.location,
    d.image_url,
    d.rating::double precision as rating,
    d.price::text as price,
    1 - (d.embedding <=> query_embedding) as similarity
  from public.destinations d
  where d.embedding is not null
    and 1 - (d.embedding <=> query_embedding) >= match_threshold
  order by d.embedding <=> query_embedding asc
  limit greatest(match_count, 1);
$$;

comment on function public.match_destinations(vector(384), float, int) is
  'Cosine-similarity search for destinations using pgvector embeddings.';

create index if not exists destinations_embedding_ivfflat_idx
  on public.destinations
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Optional: allows client-side RPC invocation from anon/authenticated roles.
grant execute on function public.match_destinations(vector(384), float, int)
  to anon, authenticated;
