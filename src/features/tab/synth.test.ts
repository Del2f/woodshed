import { describe, expect, it } from 'vitest';
import { detectPitch, midiToFreq } from '../tuner/pitch';
import { renderPluck } from './synth';

const SR = 44100;

/** 튜너와 같은 음높이 검출기로 잰다 */
const pitchOf = (x: Float32Array) => detectPitch(x.slice(4000, 4000 + 4096), SR) ?? 0;

describe('현 진동 합성', () => {
  it.each([40, 45, 52, 64, 76])('MIDI %i 음높이 (±15센트)', (m) => {
    const cents = 1200 * Math.log2(pitchOf(renderPluck(SR, m, 'open')) / midiToFreq(m));
    expect(Math.abs(cents)).toBeLessThan(15);
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
