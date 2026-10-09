export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export interface TuningPreset {
  id: string;
  label: string;
  /** 낮은 줄 → 높은 줄 순서의 MIDI 번호 */
  strings: number[];
}

export const TUNING_PRESETS: TuningPreset[] = [
  { id: 'standard', label: 'Standard (E)', strings: [40, 45, 50, 55, 59, 64] },
  { id: 'eb', label: 'Eb (반음 다운)', strings: [39, 44, 49, 54, 58, 63] },
  { id: 'dropd', label: 'Drop D', strings: [38, 45, 50, 55, 59, 64] },
  { id: 'dstd', label: 'D Standard', strings: [38, 43, 48, 53, 57, 62] },
  { id: 'dropc', label: 'Drop C', strings: [36, 43, 48, 53, 57, 62] },
  { id: 'dropb', label: 'Drop B', strings: [35, 42, 47, 52, 56, 61] },
  { id: '7std', label: '7현 Standard (B)', strings: [35, 40, 45, 50, 55, 59, 64] },
  { id: '7dropa', label: '7현 Drop A', strings: [33, 40, 45, 50, 55, 59, 64] },
];

export function midiName(midi: number): string {
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

export function midiToFreq(midi: number, a4 = 440): number {
  return a4 * 2 ** ((midi - 69) / 12);
}

export interface NoteReading {
  midi: number;
  /** 소수점 포함 MIDI 값 */
  midiFloat: number;
  name: string;
  octave: number;
  /** -50 ~ +50 */
  cents: number;
}

export function noteFromFrequency(freq: number, a4 = 440): NoteReading {
  const midiFloat = 69 + 12 * Math.log2(freq / a4);
  const midi = Math.round(midiFloat);
  return {
    midi,
    midiFloat,
    name: NOTE_NAMES[((midi % 12) + 12) % 12],
    octave: Math.floor(midi / 12) - 1,
    cents: Math.round((midiFloat - midi) * 100),
  };
}

/** 지금 음에 가장 가까운 줄의 인덱스 */
export function nearestString(midiFloat: number, strings: number[]): number {
  let best = 0;
  for (let i = 1; i < strings.length; i++) {
    if (Math.abs(strings[i] - midiFloat) < Math.abs(strings[best] - midiFloat)) best = i;
  }
  return best;
}

/**
 * McLeod Pitch Method(NSDF) 기반 음높이 검출.
 * 기타 기본음은 배음보다 약할 때가 많아, 첫 번째로 '충분히 높은' 피크를 고르는 방식이
 * 단순 자기상관보다 옥타브 오류가 적다. 40Hz(7·8현 저음)~1400Hz 범위.
 */
export function detectPitch(buf: Float32Array, sampleRate: number, minFreq = 40, maxFreq = 1400): number | null {
  const n = buf.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n);
  if (rms < 0.008) return null;

  const window = Math.floor(n / 2);
  const minLag = Math.max(2, Math.floor(sampleRate / maxFreq));
  const maxLag = Math.min(window - 1, Math.ceil(sampleRate / minFreq));
  const nsdf = new Float32Array(maxLag + 2);

  for (let tau = minLag; tau <= maxLag + 1; tau++) {
    let acf = 0;
    let m = 0;
    for (let i = 0; i < window; i++) {
      const a = buf[i];
      const b = buf[i + tau];
      acf += a * b;
      m += a * a + b * b;
    }
    nsdf[tau] = m > 0 ? (2 * acf) / m : 0;
  }

  // 양수 구간마다 최대값(키 최대값) 수집
  const peaks: number[] = [];
  let tau = minLag;
  while (tau <= maxLag && nsdf[tau] > 0) tau++; // 첫 양수 구간(0 lag 근처)은 건너뜀
  let bestInRegion = -1;
  for (; tau <= maxLag; tau++) {
    if (nsdf[tau] > 0) {
      if (bestInRegion < 0 || nsdf[tau] > nsdf[bestInRegion]) bestInRegion = tau;
    } else if (bestInRegion >= 0) {
      peaks.push(bestInRegion);
      bestInRegion = -1;
    }
  }
  if (bestInRegion >= 0) peaks.push(bestInRegion);
  if (!peaks.length) return null;

  const highest = Math.max(...peaks.map((p) => nsdf[p]));
  if (highest < 0.5) return null;
  const chosen = peaks.find((p) => nsdf[p] >= 0.9 * highest)!;

  // 포물선 보간으로 lag를 소수점까지
  const y0 = nsdf[chosen - 1] ?? nsdf[chosen];
  const y1 = nsdf[chosen];
  const y2 = nsdf[chosen + 1] ?? nsdf[chosen];
  const denom = y0 - 2 * y1 + y2;
  const shift = denom !== 0 ? (0.5 * (y0 - y2)) / denom : 0;
  return sampleRate / (chosen + shift);
}
