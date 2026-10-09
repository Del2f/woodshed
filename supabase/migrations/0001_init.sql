-- Woodshed 초기 스키마
-- Supabase 대시보드 → SQL Editor 에 붙여 넣고 Run 하세요.
-- 모든 표는 로그인한 본인 행만 읽고 쓸 수 있습니다 (RLS).

create table if not exists public.songs (
  id                uuid primary key,
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title             text not null,
  artist            text not null default '',
  file_name         text not null,
  duration_sec      real,
  bpm               real,
  musical_key       text,
  tuning            text not null default 'Standard (E)',
  last_practiced_at timestamptz,
  last_loop_id      uuid,
  created_at        timestamptz not null default now()
);

create table if not exists public.loops (
  id         uuid primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  song_id    uuid not null references public.songs (id) on delete cascade,
  name       text not null,
  start_sec  real not null,
  end_sec    real not null check (end_sec > start_sec),
  speed      real not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.practice_sessions (
  id           uuid primary key,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  song_id      uuid references public.songs (id) on delete set null,
  started_at   timestamptz not null,
  duration_sec integer not null check (duration_sec >= 0)
);

create index if not exists songs_user_idx on public.songs (user_id);
create index if not exists loops_song_idx on public.loops (song_id);
create index if not exists sessions_user_started_idx on public.practice_sessions (user_id, started_at);

alter table public.songs enable row level security;
alter table public.loops enable row level security;
alter table public.practice_sessions enable row level security;

create policy "본인 곡만" on public.songs
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "본인 구간만" on public.loops
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "본인 연습 기록만" on public.practice_sessions
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
