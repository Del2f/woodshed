/** 파형 확대·축소와 구간 미세 조정 계산 (화면과 분리해 테스트한다) */

/** 최대 확대: 1초 = 2000px (1px ≈ 0.5ms) */
export const MAX_ZOOM = 2000;

export function clampZoom(pxPerSec: number, fit: number): number {
  return Math.min(MAX_ZOOM, Math.max(fit, pxPerSec));
}

/** 슬라이더(0~100)는 로그 눈금 — 어느 배율에서든 같은 거리만큼 움직이면 같은 비율로 확대 */
export function zoomToSlider(pxPerSec: number, fit: number): number {
  if (fit <= 0 || fit >= MAX_ZOOM) return 0;
  const z = clampZoom(pxPerSec, fit);
  return (Math.log(z / fit) / Math.log(MAX_ZOOM / fit)) * 100;
}

export function sliderToZoom(value: number, fit: number): number {
  if (fit <= 0 || fit >= MAX_ZOOM) return fit;
  return fit * (MAX_ZOOM / fit) ** (Math.min(100, Math.max(0, value)) / 100);
}

/** 확대 후에도 anchorX(화면상 위치)에 있던 시각이 그 자리에 그대로 있도록 하는 스크롤 값 */
export function anchoredScroll(timeAtAnchor: number, anchorX: number, pxPerSec: number): number {
  return Math.max(0, timeAtAnchor * pxPerSec - anchorX);
}

export type NudgeStep = 0.01 | 0.1 | 'beat';

/** 구간 끝을 한 칸 옮긴다. 'beat'이면 다음/이전 박으로 */
export function nudge(t: number, dir: 1 | -1, step: NudgeStep, beats: number[]): number {
  if (step === 'beat' && beats.length) {
    if (dir > 0) return beats.find((b) => b > t + 0.001) ?? t;
    for (let i = beats.length - 1; i >= 0; i--) if (beats[i] < t - 0.001) return beats[i];
    return t;
  }
  const s = step === 'beat' ? 0.1 : step;
  return Math.max(0, Math.round((t + dir * s) * 1000) / 1000);
}

/** 마디 번호를 몇 마디마다 쓸지 — 글자가 겹치지 않게 최소 36px 간격 */
export function markerStride(pxPerBar: number): number {
  for (const s of [1, 2, 4, 8, 16, 32, 64]) if (s * pxPerBar >= 36) return s;
  return 128;
}
