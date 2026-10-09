import { describe, expect, it } from 'vitest';
import { anchoredScroll, clampZoom, markerStride, MAX_ZOOM, nudge, sliderToZoom, zoomToSlider } from './zoom';

describe('줌 배율', () => {
  const fit = 4; // 250초 곡을 1000px에 = 4px/초
  it('전체 보기보다 작게, 최대보다 크게는 안 된다', () => {
    expect(clampZoom(1, fit)).toBe(fit);
    expect(clampZoom(99999, fit)).toBe(MAX_ZOOM);
  });
  it('슬라이더 ↔ 배율 왕복', () => {
    expect(sliderToZoom(0, fit)).toBeCloseTo(fit);
    expect(sliderToZoom(100, fit)).toBeCloseTo(MAX_ZOOM);
    expect(zoomToSlider(sliderToZoom(37, fit), fit)).toBeCloseTo(37);
  });
  it('로그 눈금: 가운데는 기하평균', () => {
    expect(sliderToZoom(50, fit)).toBeCloseTo(Math.sqrt(fit * MAX_ZOOM));
  });
});

describe('anchoredScroll', () => {
  it('커서 아래 시각이 그대로 남는다', () => {
    // 10초 지점이 화면 x=300에 있었다면, 200px/초로 확대해도 x=300에 있어야 함
    const scroll = anchoredScroll(10, 300, 200);
    expect(10 * 200 - scroll).toBe(300);
  });
  it('음수 스크롤은 0', () => {
    expect(anchoredScroll(0.5, 300, 100)).toBe(0);
  });
});

describe('nudge', () => {
  const beats = [0, 0.5, 1, 1.5, 2];
  it('0.01초 단위', () => {
    expect(nudge(1.234, 1, 0.01, beats)).toBe(1.244);
    expect(nudge(0.005, -1, 0.01, beats)).toBe(0);
  });
  it('박 단위는 다음/이전 박으로 (박 위에 있으면 건너뜀)', () => {
    expect(nudge(1, 1, 'beat', beats)).toBe(1.5);
    expect(nudge(1.2, -1, 'beat', beats)).toBe(1);
    expect(nudge(1, -1, 'beat', beats)).toBe(0.5);
    expect(nudge(2, 1, 'beat', beats)).toBe(2);
  });
  it('박 정보가 없으면 0.1초', () => {
    expect(nudge(1, 1, 'beat', [])).toBe(1.1);
  });
});

describe('markerStride', () => {
  it('마디 간격이 좁으면 건너뛰며 번호를 쓴다', () => {
    expect(markerStride(80)).toBe(1);
    expect(markerStride(20)).toBe(2);
    expect(markerStride(5)).toBe(8);
  });
});
