import { describe, expect, it } from 'vitest';
import { DEFAULT_TRAINER, rateAfterLoop } from './speedTrainer';

const on = { ...DEFAULT_TRAINER, enabled: true, step: 0.05, target: 1, everyLoops: 2 };

describe('rateAfterLoop', () => {
  it('꺼져 있으면 그대로', () => {
    expect(rateAfterLoop(0.7, 2, { ...on, enabled: false })).toBe(0.7);
  });
  it('N번마다 한 단계씩 올린다', () => {
    expect(rateAfterLoop(0.7, 1, on)).toBe(0.7);
    expect(rateAfterLoop(0.7, 2, on)).toBe(0.75);
  });
  it('목표를 넘지 않는다', () => {
    expect(rateAfterLoop(0.98, 2, on)).toBe(1);
    expect(rateAfterLoop(1, 4, on)).toBe(1);
  });
  it('부동소수 오차 없이 85% → 90%', () => {
    expect(rateAfterLoop(0.85, 2, on)).toBe(0.9);
  });
});
