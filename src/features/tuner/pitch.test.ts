import { describe, expect, it } from 'vitest';
import { detectPitch, midiName, midiToFreq, nearestString, noteFromFrequency, TUNING_PRESETS } from './pitch';

const SR = 48000;

/** 기본음 + 배음(기타처럼 2배음이 더 강하게) */
function guitarLike(freq: number, n = 4096): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    out[i] =
      0.3 * Math.sin(2 * Math.PI * freq * t) +
      0.5 * Math.sin(2 * Math.PI * 2 * freq * t) +
      0.2 * Math.sin(2 * Math.PI * 3 * freq * t);
  }
  return out;
}

describe('detectPitch', () => {
  it.each([
    ['7현 Drop A (A1)', 33],
    ['7현 B (B1)', 35],
    ['6번 줄 E2', 40],
    ['5번 줄 A2', 45],
    ['3번 줄 G3', 55],
    ['1번 줄 E4', 64],
    ['12프렛 E5', 76],
  ])('%s 을 1센트 안으로 찾는다', (_label, midi) => {
    const f = midiToFreq(midi);
    const detected = detectPitch(guitarLike(f), SR)!;
    expect(detected).not.toBeNull();
    expect(Math.abs(noteFromFrequency(detected).midiFloat - midi) * 100).toBeLessThan(1);
  });

  it('소리가 없으면 null', () => {
    expect(detectPitch(new Float32Array(4096), SR)).toBeNull();
  });
});

describe('noteFromFrequency', () => {
  it('A4 = 440Hz', () => {
    expect(noteFromFrequency(440)).toMatchObject({ name: 'A', octave: 4, cents: 0 });
  });
  it('살짝 높은 E2는 + 센트', () => {
    const r = noteFromFrequency(midiToFreq(40.1));
    expect(r.name).toBe('E');
    expect(r.cents).toBe(10);
  });
});

describe('튜닝 프리셋', () => {
  it('Drop D 6번 줄은 D2', () => {
    expect(midiName(TUNING_PRESETS.find((t) => t.id === 'dropd')!.strings[0])).toBe('D2');
  });
  it('가장 가까운 줄을 고른다', () => {
    expect(nearestString(44.7, TUNING_PRESETS[0].strings)).toBe(1);
  });
});
