import { describe, expect, it } from 'vitest';
import { emptyTab, getNote } from './model';
import { barBounds, candidates, draftTab, slotOf, type HeardNote } from './transcribe';

const STANDARD = [40, 45, 50, 55, 59, 64];
const heard = (start: number, midi: number, extra: Partial<HeardNote> = {}): HeardNote => ({ start, end: start + 0.2, midi, amp: 0.8, onset: 0.9, bend: 0, ...extra });

describe('barBounds', () => {
  it('구간 시작 이전의 마지막 마디 시작부터', () => {
    expect(barBounds(2.5, [0, 2, 4, 6, 8], 120, 2)).toEqual([2, 4, 6]);
  });
  it('마디 시작점이 모자라면 마지막 마디 길이로 이어 간다', () => {
    expect(barBounds(4, [0, 2, 4], 120, 3)).toEqual([4, 6, 8, 10]);
  });
  it('분석이 없으면 BPM으로', () => {
    expect(barBounds(1, null, 120, 2)).toEqual([1, 3, 5]);
  });
});

describe('slotOf', () => {
  const b = [0, 2, 4];
  it('가장 가까운 칸으로', () => {
    expect(slotOf(0.13, b, [16, 16])).toEqual({ m: 0, s: 1 });
    expect(slotOf(2.5, b, [16, 8])).toEqual({ m: 1, s: 2 });
  });
  it('마디 끝에 붙은 음은 다음 마디 첫 칸', () => {
    expect(slotOf(1.99, b, [16, 16])).toEqual({ m: 1, s: 0 });
    expect(slotOf(3.99, b, [16, 16])).toBeNull();
  });
  it('첫 마디보다 조금 이른 음은 첫 칸, 많이 이르면 버린다', () => {
    expect(slotOf(-0.05, b, [16, 16])).toEqual({ m: 0, s: 0 });
    expect(slotOf(-0.5, b, [16, 16])).toBeNull();
  });
});

describe('candidates', () => {
  it('E2는 6번 줄 개방현뿐', () => {
    const c = candidates([40], STANDARD);
    expect(c.map((x) => x.notes[0])).toEqual([{ midi: 40, str: 0, fret: 0 }]);
  });
  it('파워코드 E5(40·47·52)는 개방 E 모양이 가장 쉽다', () => {
    const best = candidates([40, 47, 52], STANDARD)[0];
    expect(best.notes.map((n) => [n.str, n.fret])).toEqual([
      [0, 0],
      [1, 2],
      [2, 2],
    ]);
  });
  it('벤딩하는 음은 개방현에 놓지 않는다', () => {
    const c = candidates([64], STANDARD, new Map([[64, 1]]));
    expect(c.every((x) => x.notes[0].fret > 0)).toBe(true);
  });
  it('손가락이 닿지 않는 화음은 없다', () => {
    expect(candidates([41, 64 + 24], STANDARD)).toHaveLength(0); // 1프렛과 24프렛
  });
});

describe('draftTab', () => {
  const base = emptyTab(STANDARD, 'Standard (E)', 120, 2);
  const bounds = [0, 2, 4];

  it('칸에 맞추고, 손이 한 자리(4프렛 폭)에 머무는 프렛을 고른다', () => {
    // A 마이너 펜타토닉을 위아래로: 어느 자리든 한 손 모양 안에서 쳐야 한다
    const run = [57, 60, 62, 64, 67, 69, 67, 64, 62, 60, 57];
    const { tab, placed } = draftTab(base, run.map((m, i) => heard(i * 0.25, m)), bounds, 0.5);
    expect(placed).toBe(run.length);
    const frets = tab.measures.flatMap((meas) => meas.cells.flatMap((col) => col.filter(Boolean).map((n) => n!.fret))).filter((f) => f > 0);
    expect(Math.max(...frets) - Math.min(...frets)).toBeLessThanOrEqual(4);
  });

  it('다른 자리로 옮겨 가는 리프는 그 자리에서 친다', () => {
    // 12프렛 근처 고음(E5 76, G5 79, A5 81)만 있으면 12프렛 부근
    const { tab } = draftTab(base, [76, 79, 81].map((m, i) => heard(i * 0.25, m)), bounds, 0.5);
    const frets = tab.measures[0].cells.flatMap((col) => col.filter(Boolean).map((n) => n!.fret));
    expect(Math.min(...frets)).toBeGreaterThanOrEqual(10);
  });

  it('같은 칸에 동시에 시작한 음은 화음', () => {
    const { tab } = draftTab(base, [heard(0, 40), heard(0.01, 47), heard(0.02, 52)], bounds, 0.5);
    expect(tab.measures[0].cells[0].filter(Boolean)).toHaveLength(3);
  });

  it('민감도보다 약한 음, 줄 범위 밖 음은 뺀다', () => {
    const r = draftTab(base, [heard(0, 64, { onset: 0.3 }), heard(0.5, 30), heard(1, 64)], bounds, 0.5);
    expect(r.placed).toBe(1);
    expect(r.skipped).toBe(1);
  });

  it('벤딩과 해머링을 표시한다', () => {
    const notes = [heard(0, 69, { bend: 2 }), heard(1, 64, { end: 1.12 }), heard(1.125, 66, { onset: 0.4 })];
    const { tab } = draftTab(base, notes, bounds, 0.3);
    const all = tab.measures[0].cells.flatMap((col, s) => col.map((n, str) => ({ n, s, str }))).filter((x) => x.n);
    const bend = all.find((x) => x.s === 0)!;
    expect(bend.n!.techs).toEqual(['bend']);
    expect(bend.n!.bend).toBe(2);
    const second = all.find((x) => x.s === 9)!;
    expect(second.n!.techs).toEqual(['h']);
    // 해머링은 같은 줄에서
    expect(all.find((x) => x.s === 8)!.str).toBe(second.str);
  });

  it('기존 타브의 마디 수·칸·튜닝을 따른다', () => {
    const { tab } = draftTab(base, [heard(2.5, 52)], bounds, 0.5);
    expect(tab.measures).toHaveLength(2);
    expect(tab.tuning).toEqual(STANDARD);
    expect(getNote(tab, 1, 4, 2)?.fret ?? getNote(tab, 1, 4, 1)?.fret).toBeDefined();
  });
});
