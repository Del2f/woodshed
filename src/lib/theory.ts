/**
 * 화성 이론 도우미 — 코드 표기 해석, 로마숫자, 어울리는 스케일, 초보자용 설명.
 * 분석 엔진(engine/woodshed_engine/theory.py)과 같은 철자를 쓴다.
 */

export const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

const PC: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

export type Quality = '' | 'm' | '7' | '5';
export type Mode = 'major' | 'minor';
export type ToneFn = 'R' | 'b3' | '3' | '5' | 'b7';

export interface Chord {
  root: number;
  rootName: string;
  quality: Quality;
  label: string;
}

export interface Key {
  tonic: number;
  tonicName: string;
  mode: Mode;
}

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];

/**
 * 기준음에서 '글자 수(steps)'만큼 올라간 음을 반음 수(semis)에 맞춰 철자한다.
 * 예) B에서 3도(steps 2, semis 4) → D#  /  E에서 7음(steps 6, semis 11) → D#
 */
export function spell(fromName: string, semis: number, steps: number): string {
  const li = LETTERS.indexOf(fromName[0]);
  const acc = fromName.slice(1) === '#' ? 1 : fromName.slice(1) === 'b' ? -1 : 0;
  const target = (li + steps) % 7;
  const wantPc = (LETTER_PC[li] + acc + semis + 120) % 12;
  let diff = (wantPc - LETTER_PC[target] + 12) % 12;
  if (diff > 6) diff -= 12;
  return LETTERS[target] + (diff > 0 ? '#'.repeat(diff) : 'b'.repeat(-diff));
}

const INTERVALS: Record<Quality, number[]> = { '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], '5': [0, 7] };
const FN_OF: Record<number, ToneFn> = { 0: 'R', 3: 'b3', 4: '3', 7: '5', 10: 'b7' };
const LETTER_STEPS: Record<number, number> = { 0: 0, 3: 2, 4: 2, 7: 4, 10: 6 };
export const FN_LABEL: Record<ToneFn, string> = { R: '근음', b3: '단3도', '3': '3도', '5': '5도', b7: '단7도' };

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const NATURAL_MINOR = [0, 2, 3, 5, 7, 8, 10];
const HARMONIC_MINOR = [0, 2, 3, 5, 7, 8, 11];
const MAJOR_PENTA = [0, 2, 4, 7, 9];
const MINOR_PENTA = [0, 3, 5, 7, 10];
const MIXOLYDIAN = [0, 2, 4, 5, 7, 9, 10];

export const pcName = (pc: number) => NOTE_NAMES[((pc % 12) + 12) % 12];

export function parseChord(label: string): Chord | null {
  const m = /^([A-G](?:#|b)?)(m|7|5)?$/.exec(label);
  if (!m) return null;
  return { root: PC[m[1]], rootName: m[1], quality: (m[2] ?? '') as Quality, label };
}

export function parseKey(name: string | null | undefined): Key | null {
  if (!name) return null;
  const minor = name.endsWith('m');
  const tonicName = minor ? name.slice(0, -1) : name;
  const root = PC[tonicName];
  return root === undefined ? null : { tonic: root, tonicName, mode: minor ? 'minor' : 'major' };
}

export function chordTones(c: Chord): { pc: number; fn: ToneFn; name: string }[] {
  return INTERVALS[c.quality].map((iv) => ({ pc: (c.root + iv) % 12, fn: FN_OF[iv], name: spell(c.rootName, iv, LETTER_STEPS[iv]) }));
}

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

/** 키 안에서의 역할을 로마숫자로. 대문자 = 메이저, 소문자 = 마이너, 키 밖의 음은 b/# 표기 */
export function romanNumeral(c: Chord, key: Key): string {
  const scale = key.mode === 'major' ? MAJOR : NATURAL_MINOR;
  const deg = (c.root - key.tonic + 12) % 12;
  let idx = scale.indexOf(deg);
  let accidental = '';
  if (idx < 0) {
    // 키 밖의 근음: 바로 위 음계 음의 b, 그게 없으면 아래 음의 #
    const up = scale.indexOf((deg + 1) % 12);
    if (up >= 0) {
      idx = up;
      accidental = 'b';
    } else {
      idx = scale.indexOf((deg + 11) % 12);
      accidental = '#';
    }
  }
  const base = NUMERALS[idx];
  if (c.quality === 'm') return accidental + base.toLowerCase();
  if (c.quality === '7') return `${accidental}${base}7`;
  if (c.quality === '5') return `${accidental}${base}5`;
  return accidental + base;
}

export function isDiatonic(c: Chord, key: Key): boolean {
  const deg = (c.root - key.tonic + 12) % 12;
  if (c.quality === '5') return (key.mode === 'major' ? MAJOR : NATURAL_MINOR).includes(deg);
  const set = key.mode === 'major'
    ? [[0, ''], [2, 'm'], [4, 'm'], [5, ''], [7, ''], [7, '7'], [9, 'm']]
    : [[0, 'm'], [3, ''], [5, 'm'], [7, 'm'], [7, ''], [7, '7'], [8, ''], [10, '']];
  return set.some(([d, q]) => d === deg && q === c.quality);
}

export interface ScaleChoice {
  name: string;
  root: number;
  pcs: number[];
  /** 키 스케일과 다른 '특징음' (예: 하모닉 마이너의 이끈음) */
  special: number[];
  /** 스케일 안에서의 올바른 음 이름 (pc → 이름) */
  names: Record<number, string>;
}

// 각 스케일 음이 기준음에서 몇 '글자' 위인지 — 철자에 쓴다
const STEPS_7 = [0, 1, 2, 3, 4, 5, 6];
const STEPS_MAJOR_PENTA = [0, 1, 2, 4, 5];
const STEPS_MINOR_PENTA = [0, 2, 3, 4, 6];

function scaleOf(rootName: string, root: number, semis: number[], letterSteps: number[], name: string, special: number[] = []): ScaleChoice {
  const names: Record<number, string> = {};
  semis.forEach((s, i) => (names[(root + s) % 12] = spell(rootName, s, letterSteps[i])));
  return { root, pcs: semis.map((s) => (root + s) % 12), name, special, names };
}

/** 이 코드 위에서 쓰기 좋은 스케일 */
export function scaleForChord(c: Chord, key: Key | null): ScaleChoice {
  if (key) {
    const deg = (c.root - key.tonic + 12) % 12;
    const t = key.tonicName;
    if (key.mode === 'minor' && deg === 7 && (c.quality === '' || c.quality === '7')) {
      return scaleOf(t, key.tonic, HARMONIC_MINOR, STEPS_7, `${t} 하모닉 마이너`, [(key.tonic + 11) % 12]);
    }
    if (isDiatonic(c, key)) {
      return key.mode === 'major'
        ? scaleOf(t, key.tonic, MAJOR, STEPS_7, `${t} 메이저`)
        : scaleOf(t, key.tonic, NATURAL_MINOR, STEPS_7, `${t} 내추럴 마이너`);
    }
  }
  const n = c.rootName;
  if (c.quality === '7') return scaleOf(n, c.root, MIXOLYDIAN, STEPS_7, `${n} 믹솔리디안`);
  if (c.quality === '') return scaleOf(n, c.root, MAJOR_PENTA, STEPS_MAJOR_PENTA, `${n} 메이저 펜타토닉`);
  return scaleOf(n, c.root, MINOR_PENTA, STEPS_MINOR_PENTA, `${n} 마이너 펜타토닉`);
}

export interface ChordExplanation {
  roman: string | null;
  role: string;
  tip: string;
  scale: ScaleChoice;
}

/** 초보자도 이해할 수 있는 한두 문장 설명 */
export function explainChord(c: Chord, key: Key | null): ChordExplanation {
  const scale = scaleForChord(c, key);
  const tones = chordTones(c);
  const third = tones.find((t) => t.fn === '3' || t.fn === 'b3');
  const fifth = tones.find((t) => t.fn === '5');
  const roman = key ? romanNumeral(c, key) : null;

  if (!key) {
    return {
      roman,
      role: '곡의 키를 모르면 역할은 알 수 없지만, 코드 구성음은 언제나 안전한 착지점이에요.',
      tip: third ? `${c.label}로 바뀌는 순간 ${third.name}(${FN_LABEL[third.fn]})에 착지해 보세요.` : `근음 ${c.rootName}에 착지해 보세요.`,
      scale,
    };
  }

  const deg = (c.root - key.tonic + 12) % 12;
  const tonic = key.tonicName;
  let role: string;
  let tip = third
    ? `${c.label}로 바뀌는 순간 ${third.name}(${FN_LABEL[third.fn]})에 착지해 보세요. 스케일은 그대로인데 반주와 확 맞물려요.`
    : `근음 ${c.rootName}이나 5도 ${fifth?.name}에 착지하면 단단하게 들려요.`;

  if (c.quality === '5') {
    role = `3도가 없는 파워코드라 밝은지 어두운지가 정해지지 않아요. 곡의 키(${scale.name})를 그대로 쓰면 돼요.`
  } else if (!isDiatonic(c, key)) {
    role = `키(${key.mode === 'minor' ? `${tonic} 마이너` : `${tonic} 메이저`}) 밖에서 빌려 온 코드예요. 이 순간만큼은 코드 구성음(${tones.map((t) => t.name).join('·')})에 집중하세요.`;
  } else if (key.mode === 'minor') {
    const lead = spell(key.tonicName, 11, 6);
    switch (deg) {
      case 0: role = `이 곡의 ‘집’이에요. ${tonic} 마이너 키의 중심 코드라 가장 안정적으로 들려요.`; tip = `${tones.map((t) => t.name).join('·')} 중 하나로 프레이즈를 끝내면 깔끔하게 마무리돼요.`; break;
      case 3: role = '나란한조(메이저)의 중심 코드라 마이너 곡 안에서 밝고 시원하게 들려요.'; break;
      case 5: role = '어둡고 무거운 색을 더하는 코드예요. 집(i)으로 돌아가기 전에 긴장을 살짝 쌓아요.'; break;
      case 7:
        if (c.quality === 'm') {
          role = '마이너 키의 5번째 코드. 긴장이 약해서 은은하게 집으로 돌아가요.';
        } else {
          role = `집(i)으로 강하게 끌어당기는 긴장의 코드예요. 안에 든 ${lead}은 원래 ${tonic} 마이너 스케일에 없는 음이라, 이 순간엔 ${lead}을 쓰는 ${tonic} 하모닉 마이너가 어울려요.`;
          tip = `${c.label}에서 ${tonic}m으로 넘어갈 때 ${lead}에서 ${tonic}로 반음 올라가며 착지해 보세요. 메탈 솔로 특유의 ‘해결’되는 느낌이 나요.`;
        }
        break;
      case 8: role = '웅장하고 서사적인 느낌의 코드. 메탈·록에서 아주 자주 나와요.'; break;
      case 10: role = '다음 코드로 밀어 올리는 역할이에요. VI–VII–i 진행이 대표적이에요.'; break;
      default: role = `${tonic} 마이너 키 안의 코드예요.`;
    }
  } else {
    switch (deg) {
      case 0: role = `이 곡의 ‘집’이에요. ${tonic} 메이저 키의 중심 코드라 가장 안정적으로 들려요.`; break;
      case 2: role = '집에서 한 걸음 나간 부드러운 코드. V로 이어지기 좋아요.'; break;
      case 4: role = '메이저 키 안의 차분한 마이너 코드예요.'; break;
      case 5: role = '밝고 열린 느낌. 집에서 한 발 떠나는 기분을 줘요.'; break;
      case 7: role = '집(I)으로 돌아가고 싶게 만드는 긴장의 코드예요.'; break;
      case 9: role = '메이저 곡 안의 슬픈 색깔. 감성적인 진행에 자주 쓰여요.'; break;
      default: role = `${tonic} 메이저 키 안의 코드예요.`;
    }
  }
  return { roman, role, tip, scale };
}

/** 시각 t의 코드 구간 인덱스 (없으면 -1) */
export function segmentAt<T extends { start: number; end: number }>(segs: T[], t: number): number {
  let lo = 0;
  let hi = segs.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (t < segs[mid].start) hi = mid - 1;
    else if (t >= segs[mid].end) lo = mid + 1;
    else return mid;
  }
  return -1;
}

/** 가장 가까운 박으로 맞추기 */
export function snapToBeat(t: number, beats: number[]): number {
  if (!beats.length) return t;
  let lo = 0;
  let hi = beats.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (beats[mid] <= t) lo = mid;
    else hi = mid;
  }
  return Math.abs(beats[lo] - t) <= Math.abs(beats[hi] - t) ? beats[lo] : beats[hi];
}

/** 시각 t가 몇 번째 마디인지 (1부터) */
export function barAt(t: number, downbeats: number[]): number {
  let n = 0;
  for (const d of downbeats) {
    if (d <= t + 0.02) n++;
    else break;
  }
  return Math.max(1, n);
}
