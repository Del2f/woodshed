/**
 * 간격 반복(SM-2를 연습용으로 단순화).
 * 잘 기억할수록 다음 복습까지 간격이 길어지고, 헷갈리면 다음 날 다시 나온다.
 * 기준은 '날짜' — 오늘 안에 언제 보든 같은 날로 친다.
 */

export type Rating = 'again' | 'hard' | 'good' | 'easy';

export interface SrsState {
  /** 이 날짜(로컬 0시) 이후로 복습 대상 */
  dueAt: string;
  intervalDays: number;
  ease: number;
  reps: number;
  lapses: number;
  lastReviewedAt: string | null;
}

export const RATINGS: { value: Rating; label: string; hint: string }[] = [
  { value: 'again', label: '다시', hint: '기억 안 남' },
  { value: 'hard', label: '어려움', hint: '겨우 쳤음' },
  { value: 'good', label: '보통', hint: '조금 틀림' },
  { value: 'easy', label: '쉬움', hint: '완벽' },
];

const DAY = 86_400_000;

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number): Date {
  const out = startOfDay(d);
  out.setDate(out.getDate() + days);
  return out;
}

/** 새로 만든 릭: 내일 첫 복습 */
export function newSrs(now = new Date()): SrsState {
  return { dueAt: addDays(now, 1).toISOString(), intervalDays: 0, ease: 2.5, reps: 0, lapses: 0, lastReviewedAt: null };
}

export function schedule(s: SrsState, rating: Rating, now = new Date()): SrsState {
  let { intervalDays, ease, reps, lapses } = s;
  switch (rating) {
    case 'again':
      lapses += 1;
      reps = 0;
      ease = Math.max(1.3, ease - 0.2);
      intervalDays = 1;
      break;
    case 'hard':
      ease = Math.max(1.3, ease - 0.15);
      intervalDays = Math.max(1, Math.round(Math.max(1, intervalDays) * 1.2));
      reps += 1;
      break;
    case 'good':
      intervalDays = reps === 0 ? 1 : reps === 1 ? 3 : Math.round(intervalDays * ease);
      reps += 1;
      break;
    case 'easy':
      intervalDays = reps === 0 ? 3 : Math.round(Math.max(1, intervalDays) * ease * 1.3);
      ease = ease + 0.15;
      reps += 1;
      break;
  }
  intervalDays = Math.min(365, Math.max(1, intervalDays));
  return { dueAt: addDays(now, intervalDays).toISOString(), intervalDays, ease: Math.round(ease * 100) / 100, reps, lapses, lastReviewedAt: now.toISOString() };
}

export function isDue(s: SrsState, now = new Date()): boolean {
  return new Date(s.dueAt).getTime() < startOfDay(now).getTime() + DAY;
}

/** '오늘', '내일', '3일 후', '지남' */
export function dueLabel(s: SrsState, now = new Date()): string {
  const days = Math.round((startOfDay(new Date(s.dueAt)).getTime() - startOfDay(now).getTime()) / DAY);
  if (days < 0) return `${-days}일 지남`;
  if (days === 0) return '오늘';
  if (days === 1) return '내일';
  if (days < 14) return `${days}일 후`;
  if (days < 60) return `${Math.round(days / 7)}주 후`;
  return `${Math.round(days / 30)}달 후`;
}
