import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { LocalStore } from '../../lib/store/localStore';
import type { QuizResult } from '../../lib/store/types';
import type { Answer, QuizSettings } from './fretNotes';
import { bestOf, buildResult, comparable, itemKey, itemLabel, weakSpots } from './quizLog';

const STD = [40, 45, 50, 55, 59, 64];
const SET: QuizSettings = { mode: 'name', scope: 'low2', naturalsOnly: true, maxFret: 12 };

const answers: Answer[] = [
  { q: { mode: 'name', spot: { si: 0, fret: 3 }, pc: 7 }, ok: true, ms: 1200.4 },
  { q: { mode: 'name', spot: { si: 1, fret: 5 }, pc: 2 }, ok: false, ms: 2800.6 },
];

const result = (over: Partial<QuizResult>): QuizResult => ({
  ...buildResult({ strings: STD, tuningLabel: 'Standard (E)', settings: SET, retry: false, answers }),
  ...over,
});

describe('퀴즈 기록', () => {
  it('문제 키는 줄 번호와 프렛(이름 맞히기) / 줄 번호와 음 이름(자리 찾기)', () => {
    expect(itemKey(STD, answers[0].q)).toBe('name:6:3');
    expect(itemKey(STD, { mode: 'find', spot: { si: 1, fret: 10 }, pc: 7 })).toBe('find:5:G');
  });

  it('한 판의 요약과 문제별 결과', () => {
    const r = buildResult({ strings: STD, tuningLabel: 'Standard (E)', settings: SET, retry: false, answers, now: new Date('2026-10-23T10:00:00Z') });
    expect(r).toMatchObject({
      lessonId: 'fretboard-notes',
      finishedAt: '2026-10-23T10:00:00.000Z',
      settings: { mode: 'name', scope: 'low2', naturalsOnly: true, maxFret: 12 },
      correct: 1,
      total: 2,
      avgMs: 2001,
      items: [{ key: 'name:6:3', ok: true, ms: 1200 }, { key: 'name:5:5', ok: false, ms: 2801 }],
    });
  });

  it('같은 튜닝·설정의 정식 판만 비교하고, 최고 기록은 정답률 → 속도 순', () => {
    const list = [
      result({ id: 'a', finishedAt: '2026-10-20T00:00:00Z', correct: 9, total: 10, avgMs: 1500 }),
      result({ id: 'b', finishedAt: '2026-10-21T00:00:00Z', correct: 10, total: 10, avgMs: 2400 }),
      result({ id: 'c', finishedAt: '2026-10-22T00:00:00Z', correct: 10, total: 10, avgMs: 1900 }),
      result({ id: 'retry', finishedAt: '2026-10-22T01:00:00Z', retry: true, correct: 3, total: 3, avgMs: 900 }),
      result({ id: 'drop', tuningLabel: 'Drop D' }),
      result({ id: 'all', settings: { ...SET, scope: 'all' } }),
    ];
    const same = comparable(list, 'Standard (E)', { ...SET });
    expect(same.map((r) => r.id)).toEqual(['c', 'b', 'a']);
    expect(bestOf(same)?.id).toBe('c');
    expect(bestOf([])).toBeNull();
  });

  it('자주 틀린 문제: 틀린 횟수 순, 같으면 틀린 비율 순', () => {
    const item = (key: string, ok: boolean) => ({ key, ok, ms: 1000 });
    const list = [
      result({ items: [item('name:6:3', false), item('name:5:5', false), item('name:6:8', true)] }),
      result({ items: [item('name:6:3', false), item('name:5:5', true), item('name:6:1', false)] }),
    ];
    expect(weakSpots(list)).toEqual([
      { key: 'name:6:3', misses: 2, tries: 2 },
      { key: 'name:6:1', misses: 1, tries: 1 },
      { key: 'name:5:5', misses: 1, tries: 2 },
    ]);
    expect(itemLabel('name:6:0')).toBe('6번 줄 개방');
    expect(itemLabel('find:5:G')).toBe('5번 줄의 G');
  });

  it('로컬 저장소: 레슨별로 최근 것부터, 백업에 포함', async () => {
    const st = new LocalStore('quiz1');
    await st.addQuizResult(result({ id: 'old', finishedAt: '2026-10-01T00:00:00Z' }));
    await st.addQuizResult(result({ id: 'new', finishedAt: '2026-10-02T00:00:00Z' }));
    await st.addQuizResult(result({ id: 'other', lessonId: 'intervals' }));
    expect((await st.listQuizResults('fretboard-notes')).map((r) => r.id)).toEqual(['new', 'old']);

    const backup = await st.exportAll();
    expect(backup.quizResults).toHaveLength(3);
    const b = new LocalStore('quiz2');
    await b.importAll(backup);
    await b.importAll(backup);
    expect(await b.listQuizResults('fretboard-notes')).toHaveLength(2);
  });
});
