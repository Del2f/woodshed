import { describe, expect, it } from 'vitest';
import { changeGrid, changeTuning, deleteMeasure, emptyTab, getNote, insertMeasure, isEmpty, setNote, tabDuration, toAscii, toEvents, toggleTech, togglePM } from './model';

const STD = [40, 45, 50, 55, 59, 64];

describe('타브 편집', () => {
  it('빈 타브: 2마디 × 16칸 × 6줄', () => {
    const t = emptyTab(STD, 'Standard (E)');
    expect(t.measures).toHaveLength(2);
    expect(t.measures[0].cells).toHaveLength(16);
    expect(t.measures[0].cells[0]).toHaveLength(6);
    expect(isEmpty(t)).toBe(true);
  });

  it('음 쓰기는 원본을 바꾸지 않는다 (실행 취소용)', () => {
    const t = emptyTab(STD, 'Standard (E)');
    const t2 = setNote(t, 0, 3, 5, { fret: 12 });
    expect(getNote(t, 0, 3, 5)).toBeNull();
    expect(getNote(t2, 0, 3, 5)).toEqual({ fret: 12 });
    expect(t2.measures[1]).toBe(t.measures[1]);
  });

  it('주법: 배타 그룹 (h ↔ p, 슬라이드 위 ↔ 아래)', () => {
    let t = setNote(emptyTab(STD, ''), 0, 0, 0, { fret: 5 });
    t = toggleTech(t, 0, 0, 0, 'h');
    t = toggleTech(t, 0, 0, 0, 'p');
    expect(getNote(t, 0, 0, 0)?.techs).toEqual(['p']);
    t = toggleTech(t, 0, 0, 0, 'vibrato');
    t = toggleTech(t, 0, 0, 0, 'p');
    expect(getNote(t, 0, 0, 0)?.techs).toEqual(['vibrato']);
  });

  it('벤딩은 기본 온음(2)', () => {
    const t = toggleTech(setNote(emptyTab(STD, ''), 0, 0, 5, { fret: 15 }), 0, 0, 5, 'bend');
    expect(getNote(t, 0, 0, 5)).toMatchObject({ fret: 15, bend: 2, techs: ['bend'] });
  });

  it('빈 칸에는 주법을 걸 수 없다', () => {
    const t = emptyTab(STD, '');
    expect(toggleTech(t, 0, 0, 0, 'h')).toBe(t);
  });

  it('마디 복제·삭제', () => {
    let t = setNote(emptyTab(STD, '', 120, 1), 0, 0, 0, { fret: 3, techs: ['mute'] });
    t = insertMeasure(t, 0, 0);
    expect(t.measures).toHaveLength(2);
    expect(getNote(t, 1, 0, 0)).toEqual({ fret: 3, techs: ['mute'] });
    expect(t.measures[1].id).not.toBe(t.measures[0].id);
    // 복제본을 고쳐도 원본은 그대로
    t = toggleTech(t, 1, 0, 0, 'mute');
    expect(getNote(t, 0, 0, 0)?.techs).toEqual(['mute']);
    t = deleteMeasure(t, 0);
    expect(t.measures).toHaveLength(1);
    expect(deleteMeasure(t, 0).measures).toHaveLength(1); // 마지막 한 마디는 비우기만
  });

  it('칸 수 바꾸기: 16분 → 8분이면 같은 박의 음은 그대로', () => {
    let t = setNote(emptyTab(STD, '', 120, 1), 0, 4, 0, { fret: 0 }); // 2박
    t = setNote(t, 0, 8, 0, { fret: 3 }); // 3박
    t = changeGrid(t, 0, 8);
    expect(t.measures[0].grid).toBe(8);
    expect(getNote(t, 0, 2, 0)?.fret).toBe(0);
    expect(getNote(t, 0, 4, 0)?.fret).toBe(3);
  });

  it('6현 → 7현: 기존 음은 같은 줄(높은 줄 기준)에 남는다', () => {
    let t = setNote(emptyTab(STD, '', 120, 1), 0, 0, 5, { fret: 12 }); // 1번 줄
    t = changeTuning(t, [35, ...STD], '7현');
    expect(t.tuning).toHaveLength(7);
    expect(getNote(t, 0, 0, 6)?.fret).toBe(12);
  });
});

describe('재생 이벤트', () => {
  it('120BPM 16칸: 한 칸 = 0.125초, 같은 줄 다음 음까지 울림', () => {
    let t = emptyTab(STD, '', 120, 1);
    t = setNote(t, 0, 0, 0, { fret: 0 });
    t = setNote(t, 0, 4, 0, { fret: 3 });
    t = setNote(t, 0, 2, 5, { fret: 12 });
    t = togglePM(t, 0, 0);
    const ev = toEvents(t);
    expect(ev.map((e) => [e.time, e.str, e.midi])).toEqual([
      [0, 0, 40],
      [0.25, 5, 76],
      [0.5, 0, 43],
    ]);
    expect(ev[0].dur).toBeCloseTo(0.5);
    expect(ev[0].pm).toBe(true);
    expect(ev[2].dur).toBeCloseTo(1.5); // 마디 끝까지
    expect(tabDuration(t)).toBe(2);
  });
});

describe('텍스트 타브', () => {
  it('높은 줄이 위, 주법 표기', () => {
    let t = emptyTab(STD, '', 120, 1, 8);
    t = setNote(t, 0, 0, 5, { fret: 12 });
    t = setNote(t, 0, 1, 5, { fret: 15 });
    t = toggleTech(t, 0, 1, 5, 'h');
    t = setNote(t, 0, 2, 5, { fret: 15 });
    t = toggleTech(t, 0, 2, 5, 'bend');
    t = toggleTech(t, 0, 2, 5, 'vibrato');
    t = setNote(t, 0, 0, 0, { fret: 0, techs: ['mute'] });
    const lines = toAscii(t).split('\n');
    expect(lines).toHaveLength(6);
    // 칸마다 '가장 긴 표기 + 구분선 1칸'. 빈 칸 5개 = '--' × 5
    expect(lines[0]).toBe('e |12-h15-15b17~-----------|');
    // 6번 줄: x(뮤트) + 칸 너비(2·3·6·1×5)만큼의 대시
    expect(lines[5]).toBe(`E |x${'-'.repeat(23)}|`);
    expect(lines.every((l) => l.length === lines[0].length)).toBe(true);
  });
});
