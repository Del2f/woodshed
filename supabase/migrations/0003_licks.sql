-- v0.3: 릭 보관함 (타브 + 원곡 구간 + 복습 일정). 내용은 data(jsonb), 곡 연결과 복습일만 열로.
create table if not exists public.licks (
  id         uuid primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  song_id    uuid references public.songs (id) on delete set null,
  due_at     timestamptz not null,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists licks_user_due_idx on public.licks (user_id, due_at);

alter table public.licks enable row level security;

create policy "본인 릭만" on public.licks
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
