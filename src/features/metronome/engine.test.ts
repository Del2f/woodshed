import { describe, expect, it } from 'vitest';
import { clampBpm, clickKind, tapTempo } from './engine';

describe('clickKind', () => {
  it('4/4, 8분 분할: 첫 박 강세, 정박, 엇박', () => {
    const kinds = Array.from({ length: 8 }, (_, t) => clickKind(t, 4, 2, true));
    expect(kinds).toEqual(['accent', 'sub', 'beat', 'sub', 'beat', 'sub', 'beat', 'sub']);
  });
  it('강세 끄면 첫 박도 일반 박', () => {
    expect(clickKind(0, 4, 1, false)).toBe('beat');
  });
  it('다음 마디 첫 박에 다시 강세', () => {
    expect(clickKind(12, 4, 3, true)).toBe('accent');
  });
});

describe('tapTempo', () => {
  it('500ms 간격 = 120 BPM', () => {
    expect(tapTempo([0, 500, 1000, 1500])).toBe(120);
  });
  it('2.5초 넘게 쉬면 새로 센다', () => {
    expect(tapTempo([0, 1000, 5000, 5400, 5800])).toBe(150);
  });
  it('탭이 하나면 null', () => {
    expect(tapTempo([100])).toBeNull();
  });
});

describe('clampBpm', () => {
  it('범위 제한', () => {
    expect(clampBpm(10)).toBe(30);
    expect(clampBpm(999)).toBe(300);
  });
});
