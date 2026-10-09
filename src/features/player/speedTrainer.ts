export interface TrainerConfig {
  enabled: boolean;
  /** 한 번에 올릴 속도 (0.05 = +5%) */
  step: number;
  /** 목표 속도 (1 = 100%) */
  target: number;
  /** 몇 번 반복할 때마다 올릴지 */
  everyLoops: number;
}

export const DEFAULT_TRAINER: TrainerConfig = { enabled: false, step: 0.05, target: 1, everyLoops: 2 };

export const MIN_RATE = 0.25;
export const MAX_RATE = 1.5;

export function clampRate(rate: number): number {
  return Math.min(MAX_RATE, Math.max(MIN_RATE, Math.round(rate * 100) / 100));
}

/** 구간을 completedLoops번째 반복 완료한 직후의 재생 속도 */
export function rateAfterLoop(rate: number, completedLoops: number, cfg: TrainerConfig): number {
  if (!cfg.enabled || completedLoops <= 0 || completedLoops % cfg.everyLoops !== 0) return rate;
  if (rate >= cfg.target) return rate;
  return Math.min(cfg.target, clampRate(rate + cfg.step));
}
