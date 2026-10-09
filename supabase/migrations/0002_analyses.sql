-- v0.2: 로컬 분석 엔진 결과 (박자·키·코드). 곡마다 하나.
create table if not exists public.analyses (
  song_id    uuid primary key references public.songs (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists analyses_user_idx on public.analyses (user_id);

alter table public.analyses enable row level security;

create policy "본인 분석 결과만" on public.analyses
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
