import { describe, expect, it } from 'vitest';
import { dueLabel, isDue, newSrs, schedule } from './srs';

const day = (d: number, h = 20) => new Date(2026, 9, d, h);

describe('간격 반복', () => {
  it('새 릭은 내일 첫 복습', () => {
    const s = newSrs(day(10));
    expect(isDue(s, day(10))).toBe(false);
    expect(isDue(s, day(11, 7))).toBe(true);
    expect(dueLabel(s, day(10))).toBe('내일');
  });

  it('보통으로 계속 맞히면 1 → 3 → 8일 …', () => {
    let s = newSrs(day(10));
    s = schedule(s, 'good', day(11));
    expect(s.intervalDays).toBe(1);
    s = schedule(s, 'good', day(12));
    expect(s.intervalDays).toBe(3);
    s = schedule(s, 'good', day(15));
    expect(s.intervalDays).toBe(8); // 3 × 2.5
    expect(dueLabel(s, day(15))).toBe('8일 후');
  });

  it('다시: 내일 다시, 쉬움 정도는 깎인다', () => {
    let s = schedule(schedule(newSrs(day(1)), 'good', day(2)), 'good', day(3));
    s = schedule(s, 'again', day(6));
    expect(s.intervalDays).toBe(1);
    expect(s.reps).toBe(0);
    expect(s.lapses).toBe(1);
    expect(s.ease).toBeCloseTo(2.3);
  });

  it('쉬움은 간격을 크게 늘린다', () => {
    const s = schedule(newSrs(day(1)), 'easy', day(2));
    expect(s.intervalDays).toBe(3);
    expect(s.ease).toBeCloseTo(2.65);
  });

  it('같은 날 몇 시에 보든 날짜 기준', () => {
    const s = schedule(newSrs(day(1)), 'good', day(2, 23));
    expect(isDue(s, day(3, 0))).toBe(true);
    expect(isDue(s, day(2, 23))).toBe(false);
  });

  it('지난 복습 표시', () => {
    const s = newSrs(day(1));
    expect(dueLabel(s, day(5))).toBe('3일 지남');
  });
});
