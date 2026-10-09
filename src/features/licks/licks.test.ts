import { describe, expect, it } from 'vitest';
import { allTags, bestBpm, dueLicks, measuresForRange, newLick } from './licks';
import { schedule } from './srs';

describe('릭', () => {
  it('곡의 튜닝·BPM으로 빈 타브를 만든다', () => {
    const l = newLick({ title: '  ', tuningLabel: 'Drop D', bpm: 168, measures: 3 });
    expect(l.title).toBe('새 릭');
    expect(l.tab.tuning[0]).toBe(38);
    expect(l.tab.bpm).toBe(168);
    expect(l.tab.measures).toHaveLength(3);
  });

  it('7현 튜닝이면 7줄', () => {
    expect(newLick({ tuningLabel: '7현 Standard (B)' }).tab.tuning).toHaveLength(7);
  });

  it('오늘 복습할 릭만, 오래 밀린 것부터', () => {
    const now = new Date(2026, 9, 20, 12);
    const old = newLick({ title: 'old', now: new Date(2026, 9, 1) });
    const fresh = newLick({ title: 'fresh', now: new Date(2026, 9, 19) });
    const later = { ...newLick({ title: 'later', now: new Date(2026, 9, 18) }) };
    later.srs = schedule(later.srs, 'easy', new Date(2026, 9, 19)); // 3일 후
    expect(dueLicks([fresh, later, old], now).map((l) => l.title)).toEqual(['old', 'fresh']);
  });

  it('태그는 많이 쓴 순, 최고 BPM', () => {
    const a = { ...newLick({}), tags: ['솔로', '스윕'], bpmLog: [{ at: '', bpm: 120 }, { at: '', bpm: 132 }] };
    const b = { ...newLick({}), tags: ['솔로'] };
    expect(allTags([a, b])).toEqual(['솔로', '스윕']);
    expect(bestBpm(a)).toBe(132);
    expect(bestBpm(b)).toBeNull();
  });
});

describe('measuresForRange', () => {
  const downbeats = [0, 2, 4, 6, 8, 10];
  it('마디 시작점으로 센다', () => {
    expect(measuresForRange(2, 6, downbeats, null)).toBe(2);
    expect(measuresForRange(1.5, 6.05, downbeats, null)).toBe(3);
  });
  it('분석이 없으면 BPM으로 어림', () => {
    expect(measuresForRange(0, 4, null, 120)).toBe(2);
    expect(measuresForRange(0, 4.1, null, 120)).toBe(2);
    expect(measuresForRange(0, 0.5, null, null)).toBe(1);
  });
  it('1–16마디로 제한', () => {
    expect(measuresForRange(0, 200, null, 120)).toBe(16);
  });
});
