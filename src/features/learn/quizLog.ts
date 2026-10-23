/** 퀴즈 한 판의 기록 만들기와, 같은 설정끼리 비교하기 */

import { uid } from '../../lib/format';
import { pcName } from '../../lib/theory';
import type { QuizResult } from '../../lib/store/types';
import { stringNumber, summarize, type Answer, type Question, type QuizSettings } from './fretNotes';

export const FRET_LESSON_ID = 'fretboard-notes';

/** 문제를 사람이 읽을 수 있는 키로: 'name:6:3' (6번 줄 3프렛 이름) / 'find:5:G' (5번 줄에서 G 찾기) */
export function itemKey(strings: number[], q: Question): string {
  const n = stringNumber(strings, q.spot.si);
  return q.mode === 'name' ? `name:${n}:${q.spot.fret}` : `find:${n}:${pcName(q.pc)}`;
}

export function buildResult(opts: {
  strings: number[];
  tuningLabel: string;
  settings: QuizSettings;
  retry: boolean;
  answers: Answer[];
  now?: Date;
}): QuizResult {
  const s = summarize(opts.answers);
  const { mode, scope, naturalsOnly, maxFret } = opts.settings;
  return {
    id: uid(),
    lessonId: FRET_LESSON_ID,
    finishedAt: (opts.now ?? new Date()).toISOString(),
    tuningLabel: opts.tuningLabel,
    settings: { mode, scope, naturalsOnly, maxFret },
    retry: opts.retry,
    correct: s.correct,
    total: s.total,
    avgMs: Math.round(s.avgMs),
    items: opts.answers.map((a) => ({ key: itemKey(opts.strings, a.q), ok: a.ok, ms: Math.round(a.ms) })),
  };
}

const sameSettings = (a: QuizResult['settings'], b: QuizResult['settings']) => {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
};

/** 같은 튜닝·같은 설정의 정식 판(틀린 것만 다시 제외), 최근 것부터 */
export function comparable(results: QuizResult[], tuningLabel: string, settings: QuizResult['settings']): QuizResult[] {
  return results
    .filter((r) => !r.retry && r.tuningLabel === tuningLabel && sameSettings(r.settings, settings))
    .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
}

/** 최고 기록: 정답률이 높은 판, 같으면 더 빨리 답한 판 */
export function bestOf(results: QuizResult[]): QuizResult | null {
  let best: QuizResult | null = null;
  for (const r of results) {
    if (!best) best = r;
    else {
      const d = r.correct / r.total - best.correct / best.total;
      if (d > 0 || (d === 0 && r.avgMs < best.avgMs)) best = r;
    }
  }
  return best;
}

export const settingsLabel = (s: QuizResult['settings']) =>
  `${s.mode === 'find' ? '이름 → 자리' : '자리 → 이름'} · ${s.scope === 'low1' ? '가장 낮은 줄' : s.scope === 'low2' ? '낮은 두 줄' : '모든 줄'} · 개방–${s.maxFret}${s.naturalsOnly ? ' · 자연음' : ''}`;

/** 'name:6:3' → '6번 줄 3프렛', 'find:5:G' → '5번 줄의 G' */
export function itemLabel(key: string): string {
  const [mode, n, x] = key.split(':');
  if (mode === 'find') return `${n}번 줄의 ${x}`;
  return `${n}번 줄 ${x === '0' ? '개방' : `${x}프렛`}`;
}

/** 최근 판들에서 자주 틀린 문제 (틀린 횟수 많은 순, 같으면 틀린 비율 높은 순) */
export function weakSpots(results: QuizResult[], limit = 5): { key: string; misses: number; tries: number }[] {
  const m = new Map<string, { misses: number; tries: number }>();
  for (const r of results) {
    for (const it of r.items) {
      const e = m.get(it.key) ?? { misses: 0, tries: 0 };
      e.tries++;
      if (!it.ok) e.misses++;
      m.set(it.key, e);
    }
  }
  return [...m.entries()]
    .filter(([, e]) => e.misses > 0)
    .map(([key, e]) => ({ key, ...e }))
    .sort((a, b) => b.misses - a.misses || b.misses / b.tries - a.misses / a.tries)
    .slice(0, limit);
}
