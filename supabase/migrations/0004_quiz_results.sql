-- v0.4: 이론 커리큘럼 퀴즈 기록. 한 판(10문제)에 한 행, 설정·문제별 결과는 data(jsonb).
create table if not exists public.quiz_results (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lesson_id   text not null,
  finished_at timestamptz not null,
  data        jsonb not null
);

create index if not exists quiz_results_user_lesson_idx on public.quiz_results (user_id, lesson_id, finished_at desc);

alter table public.quiz_results enable row level security;

create policy "본인 퀴즈 기록만" on public.quiz_results
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
