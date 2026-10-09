import { describe, expect, it } from 'vitest';
import { detectPitch, midiToFreq } from '../tuner/pitch';
import { renderPluck } from './synth';

const SR = 44100;

/** 시험마다 같은 잡음이 나오게 하는 간단한 난수 (mulberry32) */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 튜너와 같은 음높이 검출기로 잰다 */
const pitchOf = (x: Float32Array) => detectPitch(x.slice(4000, 4000 + 4096), SR) ?? 0;

describe('현 진동 합성', () => {
  // 올패스로 소수점 주기를 맞춰서 측정상 오차 0센트. (MIDI 84 이상은 튜너 검출기가 옥타브를 틀리는 경우가 있어 제외)
  it.each([40, 45, 52, 64, 76])('MIDI %i 음높이 (±5센트)', (m) => {
    const cents = 1200 * Math.log2(pitchOf(renderPluck(SR, m, 'open', seeded(1))) / midiToFreq(m));
    expect(Math.abs(cents)).toBeLessThan(5);
  });
  it('팜뮤트는 개방음보다 짧고 빨리 사라진다', () => {
    const open = renderPluck(SR, 40, 'open');
    const pm = renderPluck(SR, 40, 'pm');
    expect(pm.length).toBeLessThan(open.length);
    const rms = (x: Float32Array, a: number, b: number) => Math.sqrt(x.subarray(a, b).reduce((s, v) => s + v * v, 0) / (b - a));
    expect(rms(pm, 8000, 12000)).toBeLessThan(rms(open, 8000, 12000) * 0.5);
  });
  it('데드 노트는 아주 짧다', () => {
    expect(renderPluck(SR, 40, 'dead').length).toBeLessThan(SR * 0.1);
  });
});
