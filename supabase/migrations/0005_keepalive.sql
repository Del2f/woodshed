-- 무료 플랜 휴면 방지: 읽기 요청(핑)만으로는 2026-11 초에 일시정지됐다.
-- 하루 한 번 이 함수를 불러 실제로 한 줄을 써서 데이터베이스 활동을 남긴다.
create table if not exists public.keepalive (
  id        int primary key default 1 check (id = 1),
  pinged_at timestamptz not null default now()
);

-- 정책 없음 = 표를 직접 읽고 쓸 수 없다. 아래 함수로만 갱신
alter table public.keepalive enable row level security;

create or replace function public.keepalive_ping()
returns timestamptz
language sql
security definer
set search_path = public
as $$
  insert into public.keepalive (id, pinged_at) values (1, now())
  on conflict (id) do update set pinged_at = excluded.pinged_at
  returning pinged_at;
$$;

revoke all on function public.keepalive_ping() from public;
grant execute on function public.keepalive_ping() to anon, authenticated;
