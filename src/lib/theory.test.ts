import { describe, expect, it } from 'vitest';
import { barAt, chordTones, explainChord, isDiatonic, parseChord, parseKey, romanNumeral, scaleForChord, segmentAt, snapToBeat } from './theory';

const c = (l: string) => parseChord(l)!;
const Em = parseKey('Em')!;
const G = parseKey('G')!;

describe('parseChord / parseKey', () => {
  it('코드 표기 해석', () => {
    expect(c('F#m')).toMatchObject({ root: 6, quality: 'm' });
    expect(c('Bb7')).toMatchObject({ root: 10, quality: '7' });
    expect(c('E5')).toMatchObject({ root: 4, quality: '5' });
    expect(parseChord('N')).toBeNull();
  });
  it('키 해석', () => {
    expect(parseKey('Em')).toEqual({ tonic: 4, tonicName: 'E', mode: 'minor' });
    expect(parseKey('Eb')).toEqual({ tonic: 3, tonicName: 'Eb', mode: 'major' });
    expect(parseKey(null)).toBeNull();
  });
});

describe('chordTones', () => {
  it('B7 = B D# F# A', () => {
    expect(chordTones(c('B7')).map((t) => `${t.name}:${t.fn}`)).toEqual(['B:R', 'D#:3', 'F#:5', 'A:b7']);
  });
  it('Em = E G B', () => {
    expect(chordTones(c('Em')).map((t) => t.fn)).toEqual(['R', 'b3', '5']);
  });
});

describe('romanNumeral', () => {
  it('E 마이너 키의 대표 진행 Em–C–D–B7', () => {
    expect(['Em', 'C', 'D', 'B7'].map((l) => romanNumeral(c(l), Em))).toEqual(['i', 'VI', 'VII', 'V7']);
  });
  it('G 메이저 키 I–V–vi–IV', () => {
    expect(['G', 'D', 'Em', 'C'].map((l) => romanNumeral(c(l), G))).toEqual(['I', 'V', 'vi', 'IV']);
  });
  it('키 밖의 코드는 b 표기 (E 마이너의 F = bII, 프리지안 느낌)', () => {
    expect(romanNumeral(c('F'), Em)).toBe('bII');
    expect(romanNumeral(c('F5'), Em)).toBe('bII5');
  });
});

describe('scaleForChord', () => {
  it('마이너 키의 V(B7)에는 하모닉 마이너, D#이 특징음', () => {
    const s = scaleForChord(c('B7'), Em);
    expect(s.name).toBe('E 하모닉 마이너');
    expect(s.special).toEqual([3]);
    expect(s.pcs).toContain(3);
    expect(s.pcs).not.toContain(2);
  });
  it('키 안의 코드는 키 스케일', () => {
    expect(scaleForChord(c('C'), Em).name).toBe('E 내추럴 마이너');
    expect(scaleForChord(c('C'), G).name).toBe('G 메이저');
  });
  it('키 밖의 코드는 코드 기준 스케일', () => {
    expect(scaleForChord(c('F'), Em).name).toBe('F 메이저 펜타토닉');
    expect(isDiatonic(c('F'), Em)).toBe(false);
  });
});

describe('explainChord', () => {
  it('B7 설명은 D#→E 해결을 안내', () => {
    const e = explainChord(c('B7'), Em);
    expect(e.roman).toBe('V7');
    expect(e.role).toContain('하모닉 마이너');
    expect(e.tip).toContain('D#에서 E로');
  });
  it('C 코드에서는 3도 E에 착지하라고', () => {
    expect(explainChord(c('C'), Em).tip).toContain('E(3도)');
  });
  it('파워코드는 3도가 없다고 설명', () => {
    expect(explainChord(c('E5'), Em).role).toContain('파워코드');
  });
});

describe('시간 도우미', () => {
  const segs = [
    { start: 0, end: 2, label: 'Em' },
    { start: 2, end: 4, label: 'C' },
  ];
  it('segmentAt', () => {
    expect(segmentAt(segs, 0)).toBe(0);
    expect(segmentAt(segs, 2)).toBe(1);
    expect(segmentAt(segs, 9)).toBe(-1);
  });
  it('snapToBeat', () => {
    expect(snapToBeat(1.24, [0, 0.5, 1, 1.5])).toBe(1);
    expect(snapToBeat(1.26, [0, 0.5, 1, 1.5])).toBe(1.5);
    expect(snapToBeat(9, [0, 0.5])).toBe(0.5);
  });
  it('barAt', () => {
    expect(barAt(0, [0, 2, 4])).toBe(1);
    expect(barAt(3.9, [0, 2, 4])).toBe(2);
    expect(barAt(4, [0.01, 2, 4])).toBe(3);
  });
});

describe('spell (음 이름 철자)', () => {
  it('코드·키에 맞는 이름', async () => {
    const { spell } = await import('./theory');
    expect(spell('B', 4, 2)).toBe('D#'); // B 메이저의 3도
    expect(spell('Eb', 4, 2)).toBe('G'); // Eb의 3도
    expect(spell('F', 3, 2)).toBe('Ab'); // F 마이너의 단3도
    expect(spell('E', 11, 6)).toBe('D#'); // E 하모닉 마이너의 7음
    expect(spell('C#', 3, 2)).toBe('E'); // C#m의 단3도
  });
  it('스케일 음 이름표', () => {
    const s = scaleForChord(c('B7'), Em);
    expect(s.names[3]).toBe('D#');
    expect(scaleForChord(c('Bb'), parseKey('F')!).names[10]).toBe('Bb');
  });
});
