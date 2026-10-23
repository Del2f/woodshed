import { describe, expect, it } from 'vitest';
import {
  checkFind, checkName, makeQuestion, makeRound, octaveChain, octaveShifts, octaveUp, pcAt, positionsOf, retryRound, scopeLabel, songRoots, summarize,
  type QuizSettings,
} from './fretNotes';
import type { SongAnalysis } from '../../lib/store/types';

const STD = [40, 45, 50, 55, 59, 64];
const DROP_D = [38, 45, 50, 55, 59, 64];
const SEVEN = [35, 40, 45, 50, 55, 59, 64];

/** 시드 고정 난수 (mulberry32) */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('지판 위 음', () => {
  it('표준 튜닝 6번 줄 3프렛 = G, 5번 줄 5프렛 = D', () => {
    expect(pcAt(STD, { si: 0, fret: 3 })).toBe(7);
    expect(pcAt(STD, { si: 1, fret: 5 })).toBe(2);
  });

  it('6번 줄의 E는 개방과 12프렛 두 자리 (0–12프렛)', () => {
    expect(positionsOf(STD, 4, 12, [0])).toEqual([{ si: 0, fret: 0 }, { si: 0, fret: 12 }]);
  });

  it('표준 튜닝에서 C는 0–12프렛에 6줄 × 1~2자리', () => {
    const spots = positionsOf(STD, 0, 12);
    expect(spots.every((s) => pcAt(STD, s) === 0)).toBe(true);
    expect(spots).toHaveLength(6);
  });
});

describe('옥타브 모양', () => {
  it('표준: 6→4, 5→3번 줄은 두 칸, 4→2, 3→1번 줄은 세 칸 오른쪽 (2번 줄 B 때문)', () => {
    expect(octaveShifts(STD).map((o) => o.shift)).toEqual([2, 2, 3, 3]);
    expect(octaveUp(STD, { si: 0, fret: 3 })).toEqual({ si: 2, fret: 5 });
    expect(octaveUp(STD, { si: 2, fret: 5 })).toEqual({ si: 4, fret: 8 });
  });

  it('Drop D는 가장 낮은 줄만 같은 프렛', () => {
    expect(octaveShifts(DROP_D)[0]).toEqual({ from: 6, to: 4, shift: 0 });
  });

  it('옥타브 모양을 위아래로 이어 간다: 5번 줄 3프렛 C → 3번 줄 5프렛, 1번 줄 8프렛', () => {
    expect(octaveChain(STD, { si: 1, fret: 3 }, 12)).toEqual([{ si: 3, fret: 5 }, { si: 5, fret: 8 }]);
    expect(octaveChain(STD, { si: 3, fret: 5 }, 12)).toEqual([{ si: 1, fret: 3 }, { si: 5, fret: 8 }]);
  });

  it('맨 위 두 줄에서는 더 올라갈 줄이 없다', () => {
    expect(octaveUp(STD, { si: 4, fret: 1 })).toBeNull();
  });
});

describe('퀴즈', () => {
  const base: QuizSettings = { mode: 'name', scope: 'low2', naturalsOnly: true, maxFret: 12 };

  it('범위 안의 줄·프렛에서만, 자연음만 낸다', () => {
    const r = seeded(1);
    for (let i = 0; i < 200; i++) {
      const q = makeQuestion(STD, base, r);
      expect(q.spot.si).toBeLessThan(2);
      expect(q.spot.fret).toBeLessThanOrEqual(12);
      expect([0, 2, 4, 5, 7, 9, 11]).toContain(q.pc);
    }
  });

  it('7현은 7·6번 줄이 낮은 두 줄', () => {
    expect(scopeLabel(SEVEN, 'low2')).toBe('7·6번 줄');
    expect(scopeLabel(STD, 'low1')).toBe('6번 줄');
  });

  it('연달아 같은 음을 내지 않는다', () => {
    const round = makeRound(STD, { ...base, scope: 'all', naturalsOnly: false }, 50, seeded(7));
    for (let i = 1; i < round.length; i++) expect(round[i].pc).not.toBe(round[i - 1].pc);
  });

  it('이름 맞히기: 같은 음이면 정답', () => {
    const q = makeQuestion(STD, base, seeded(3));
    expect(checkName(q, q.pc)).toBe(true);
    expect(checkName(q, q.pc + 12)).toBe(true);
    expect(checkName(q, q.pc + 1)).toBe(false);
  });

  it('자리 찾기: 그 줄의 같은 음이면 0프렛·12프렛 어느 쪽이든 정답, 다른 줄은 오답', () => {
    const q = { mode: 'find' as const, spot: { si: 0, fret: 0 }, pc: 4 };
    expect(checkFind(STD, q, { si: 0, fret: 12 })).toBe(true);
    expect(checkFind(STD, q, { si: 0, fret: 0 })).toBe(true);
    expect(checkFind(STD, q, { si: 5, fret: 0 })).toBe(false);
    expect(checkFind(STD, q, { si: 0, fret: 1 })).toBe(false);
  });

  it('틀린 문제만 다시: 같은 문제들을 순서만 섞는다', () => {
    const missed = makeRound(STD, base, 5, seeded(11));
    const again = retryRound(missed, seeded(2));
    expect(again).toHaveLength(5);
    expect(new Set(again)).toEqual(new Set(missed));
  });

  it('결과 요약', () => {
    const q = makeQuestion(STD, base, seeded(5));
    const s = summarize([{ q, ok: true, ms: 1000 }, { q, ok: false, ms: 3000 }]);
    expect(s).toEqual({ correct: 1, total: 2, avgMs: 2000, missed: [q] });
  });
});

describe('내 곡의 근음', () => {
  const analysis = {
    key: { name: 'Em', tonic: 4, mode: 'minor', confidence: 0.8 },
    chords: [
      { start: 0, end: 8, label: 'E5' },
      { start: 8, end: 10, label: 'C' },
      { start: 10, end: 12, label: 'N' },
      { start: 12, end: 16, label: 'D' },
      { start: 16, end: 20, label: 'Em' },
    ],
  } as unknown as SongAnalysis;

  it('오래 울린 근음 순서, 같은 근음의 코드는 묶는다', () => {
    expect(songRoots(analysis, null)).toEqual([
      { pc: 4, name: 'E', chords: ['E5', 'Em'] },
      { pc: 2, name: 'D', chords: ['D'] },
      { pc: 0, name: 'C', chords: ['C'] },
    ]);
  });

  it('분석이 없으면 곡 정보의 키 으뜸음', () => {
    expect(songRoots(null, 'F#m')).toEqual([{ pc: 6, name: 'F#', chords: [] }]);
    expect(songRoots(null, null)).toEqual([]);
  });
});
