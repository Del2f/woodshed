/**
 * 테크닉 연습 패턴 생성기 — 스케일·모드의 3nps 포지션, 스윕 아르페지오 모양, 그리고 그 패턴의 연습용 타브.
 * 손으로 적지 않고 '규칙'으로 만들기 때문에 키 12개 × 튜닝(드롭·7현 포함) 어디서나 같은 모양이 나온다.
 * strings는 앱 전체와 같이 낮은 줄 → 높은 줄 MIDI 번호, si = 그 배열의 인덱스(0 = 가장 낮은 줄).
 */

import { NOTE_NAMES, spell } from '../../lib/theory';
import { emptyMeasure, type TabData, type TabNote } from '../tab/model';

export interface PatternNote {
  si: number;
  fret: number;
  midi: number;
  /** 지판 점에 쓰는 역할 표시 ('1', 'b3', 'R', '5' …) */
  label: string;
  /** 근음이면 true (지판에서 주황으로 칠한다) */
  root: boolean;
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];

// ── 모드 ─────────────────────────────

export type ModeId = 'ionian' | 'dorian' | 'phrygian' | 'lydian' | 'mixolydian' | 'aeolian' | 'locrian';

export interface ModeInfo {
  id: ModeId;
  name: string;
  /** 다른 이름 (메이저, 내추럴 마이너) */
  alias?: string;
  /** 메이저 스케일의 몇 번째 음에서 시작하는지 (0 = 1번째) */
  degree: number;
  /** 같은 근음의 메이저(또는 마이너)와 다른 특징음 — 반음 수 */
  color: number;
  /** 밝기 순서 (1 = 가장 밝음) */
  brightness: number;
  sound: string;
  metal: string;
}

export const MODES: ModeInfo[] = [
  {
    id: 'ionian', name: '이오니안', alias: '메이저', degree: 0, color: 11, brightness: 2,
    sound: '밝고 안정적. 모든 모드의 기준',
    metal: '메탈에서는 드물고, 파워 메탈의 승리감 있는 멜로디나 메이저 하모니 솔로에',
  },
  {
    id: 'dorian', name: '도리안', degree: 1, color: 9, brightness: 4,
    sound: '마이너인데 6도가 밝아서 덜 어두움. 세련된 마이너',
    metal: '그루브·프로그 메탈, 펑키한 마이너 리프. 에올리안 솔로에 6도만 바꿔 색을 낼 때',
  },
  {
    id: 'phrygian', name: '프리지안', degree: 2, color: 1, brightness: 6,
    sound: '근음 바로 위의 반음(b2)이 만드는 긴장. 스페인풍·어두움',
    metal: '스래시·데스 메탈의 기본. 개방 E와 F를 오가는 반음 리프가 바로 프리지안',
  },
  {
    id: 'lydian', name: '리디안', degree: 3, color: 6, brightness: 1,
    sound: '#4가 만드는 떠 있는 듯한 밝음. 몽환적',
    metal: '프로그 메탈·기타 인스트의 서정적인 부분, 영화 음악 같은 분위기',
  },
  {
    id: 'mixolydian', name: '믹솔리디안', degree: 4, color: 10, brightness: 3,
    sound: '메이저인데 7도가 낮음(b7). 블루지하고 록킹함',
    metal: '하드록·헤비메탈 리프 (메이저 코드 위에서 b7로 거칠게)',
  },
  {
    id: 'aeolian', name: '에올리안', alias: '내추럴 마이너', degree: 5, color: 8, brightness: 5,
    sound: '기본 마이너. 슬프고 무거움',
    metal: '메탈 리프와 솔로의 기본 바탕. i–VI–VII(Em–C–D) 진행의 고향',
  },
  {
    id: 'locrian', name: '로크리안', degree: 6, color: 6, brightness: 7,
    sound: 'b2와 b5가 겹친 가장 어둡고 불안정한 소리. 근음 코드부터 디미니시드',
    metal: '데스·블랙·젠트 메탈의 불길한 리프. b5(트라이톤)를 강조해서',
  },
];

export const modeById = (id: ModeId) => MODES.find((m) => m.id === id) ?? MODES[0];

/** 모드의 반음 구성 (근음 0부터 7음) */
export function modeSemis(id: ModeId): number[] {
  const d = modeById(id).degree;
  return Array.from({ length: 7 }, (_, i) => (MAJOR[(d + i) % 7] - MAJOR[d] + 12) % 12);
}

/** 메이저 스케일과 비교한 도수 이름: 1 2 b3 4 5 b6 b7 … */
export function degreeLabels(semis: number[]): string[] {
  return semis.map((s, i) => {
    const diff = s - MAJOR[i];
    return (diff < 0 ? 'b'.repeat(-diff) : '#'.repeat(diff)) + String(i + 1);
  });
}

/** 모드의 음 이름 (근음 철자 기준으로 글자를 하나씩 올려 철자) */
export function modeNoteNames(rootName: string, id: ModeId): string[] {
  return modeSemis(id).map((s, i) => spell(rootName, s, i));
}

/** 키 선택용 근음 — 메탈에서 자주 쓰는 E부터 */
export const ROOTS: { pc: number; name: string }[] = [4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2, 3].map((pc) => ({ pc, name: NOTE_NAMES[pc] }));

// ── 3nps (한 줄에 세 음) ─────────────────────

/**
 * 3nps 포지션 7개. 각 포지션은 가장 낮은 줄에서 스케일의 다른 음으로 시작해 줄마다 세 음씩 올라간다.
 * 개방현을 쓰지 않도록 시작 프렛은 1–12, 포지션 번호는 지판 낮은 쪽부터.
 */
export function threeNpsPositions(strings: number[], rootPc: number, semis: number[]): PatternNote[][] {
  const labels = degreeLabels(semis);
  const out: PatternNote[][] = [];
  for (let start = 0; start < 7; start++) {
    const pc = (rootPc + semis[start]) % 12;
    let fret = (((pc - strings[0]) % 12) + 12) % 12;
    if (fret < 1) fret += 12;
    let midi = strings[0] + fret;
    let deg = start;
    const notes: PatternNote[] = [];
    for (let si = 0; si < strings.length; si++) {
      for (let k = 0; k < 3; k++) {
        if (notes.length) {
          // 다음 스케일 음
          const next = (deg + 1) % 7;
          midi += (semis[next] - semis[deg] + 12) % 12;
          deg = next;
        }
        notes.push({ si, fret: midi - strings[si], midi, label: labels[deg], root: deg === 0 });
      }
    }
    // 낮은 줄 → 높은 줄로 넘어가며 프렛이 0 아래로 내려가면 한 옥타브 위로
    if (notes.some((n) => n.fret < 1)) for (const n of notes) (n.fret += 12), (n.midi += 12);
    out.push(notes);
  }
  return out.sort((a, b) => a[0].fret - b[0].fret);
}

// ── 스윕 아르페지오 ─────────────────────────

export type TriadQuality = 'maj' | 'min' | 'dim' | 'aug';

export const TRIADS: Record<TriadQuality, { semis: number[]; labels: string[]; suffix: string; name: string }> = {
  maj: { semis: [0, 4, 7], labels: ['R', '3', '5'], suffix: '', name: '메이저' },
  min: { semis: [0, 3, 7], labels: ['R', 'b3', '5'], suffix: 'm', name: '마이너' },
  dim: { semis: [0, 3, 6], labels: ['R', 'b3', 'b5'], suffix: 'dim', name: '디미니시드' },
  aug: { semis: [0, 4, 8], labels: ['R', '3', '#5'], suffix: 'aug', name: '오그멘티드' },
};

export const INVERSIONS = [
  { value: 0, label: '기본형', hint: '근음부터 (R–3–5)' },
  { value: 1, label: '1전위', hint: '3도부터 (3–5–R)' },
  { value: 2, label: '2전위', hint: '5도부터 (5–R–3)' },
];

/** 줄 묶음마다 가장 흔한 스윕 모양 — 줄마다 몇 음을 칠지 (낮은 줄부터) */
const PREFERRED_COUNTS: Record<number, number[]> = {
  3: [1, 1, 2],
  4: [1, 1, 1, 2],
  5: [2, 1, 1, 1, 2],
};

/**
 * 위쪽 n개 줄에서 치는 트라이어드 스윕 모양 (오름차순).
 * 줄마다 한두 음 — 흔한 모양(3줄은 1·1·2, 5줄은 2·1·1·1·2)을 우선하고, 손 벌림(가장 낮은·높은 프렛 차)이 작은 쪽을 고른다.
 * 개방현 없이(1프렛 이상) 지판 낮은 쪽에서 되는 자리를 찾는다. 안 되면 null.
 */
export function sweepShape(strings: number[], stringCount: 3 | 4 | 5, rootPc: number, quality: TriadQuality, inversion: number): PatternNote[] | null {
  const triad = TRIADS[quality];
  const first = strings.length - stringCount;
  if (first < 0) return null;
  const used = strings.slice(first);
  const pref = PREFERRED_COUNTS[stringCount];

  // 시작 음: 가장 낮은 줄 위에서 인버전에 맞는 음, 낮은 프렛부터 두 옥타브 후보
  const startPc = (rootPc + triad.semis[inversion]) % 12;
  const base = (((startPc - used[0]) % 12) + 12) % 12;

  let best: { notes: PatternNote[]; score: number } | null = null;
  for (const startFret of [base, base + 12]) {
    if (startFret < 1) continue;
    // 줄마다 1 또는 2음 — 2^n 가지
    for (let mask = 0; mask < 1 << stringCount; mask++) {
      const counts = used.map((_, i) => ((mask >> i) & 1 ? 2 : 1));
      const total = counts.reduce((a, b) => a + b, 0);
      // 오름차순 화음 음 나열
      const seq: { midi: number; idx: number }[] = [];
      let midi = used[0] + startFret;
      let idx = inversion;
      for (let k = 0; k < total; k++) {
        if (k) {
          const next = (idx + 1) % 3;
          midi += (triad.semis[next] - triad.semis[idx] + 12) % 12;
          idx = next;
        }
        seq.push({ midi, idx });
      }
      const notes: PatternNote[] = [];
      let k = 0;
      counts.forEach((c, i) => {
        for (let j = 0; j < c; j++, k++) {
          const s = seq[k];
          notes.push({ si: first + i, fret: s.midi - used[i], midi: s.midi, label: triad.labels[s.idx], root: s.idx === 0 });
        }
      });
      const frets = notes.map((n) => n.fret);
      const lo = Math.min(...frets);
      const hi = Math.max(...frets);
      if (lo < 1 || hi > 22) continue;
      // 한 줄 안의 두 음은 2–5칸 (해머링·풀링이나 슬라이드로 닿는 거리)
      const sameString = notes.every((n, i) => i === 0 || n.si !== notes[i - 1].si || (n.fret - notes[i - 1].fret >= 2 && n.fret - notes[i - 1].fret <= 5));
      if (!sameString) continue;
      const span = hi - lo;
      if (span > 6) continue;
      const mismatch = counts.filter((c, i) => c !== pref[i]).length;
      // 흔한 모양 > 작은 손 벌림 > 낮은 자리
      const score = mismatch * 10 + span + lo * 0.01;
      if (!best || score < best.score) best = { notes, score };
    }
  }
  return best?.notes ?? null;
}

/** 키 안의 트라이어드 7개 (메이저 키 또는 마이너 키 = 에올리안) */
export function diatonicTriads(rootPc: number, rootName: string, mode: 'ionian' | 'aeolian'): { root: number; name: string; quality: TriadQuality; roman: string }[] {
  const semis = modeSemis(mode);
  const names = modeNoteNames(rootName, mode);
  const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'];
  return semis.map((s, i) => {
    const third = (semis[(i + 2) % 7] - s + 12) % 12;
    const fifth = (semis[(i + 4) % 7] - s + 12) % 12;
    const quality: TriadQuality = third === 4 ? (fifth === 8 ? 'aug' : 'maj') : fifth === 6 ? 'dim' : 'min';
    const r = ROMAN[i];
    const roman = quality === 'maj' || quality === 'aug' ? r.toUpperCase() : r;
    // 마이너 키의 III·VI·VII는 메이저 스케일 기준으로 반음 낮은 자리 (bIII …)
    const flat = s < MAJOR[i] ? 'b' : '';
    return {
      root: (rootPc + s) % 12,
      name: names[i] + TRIADS[quality].suffix,
      quality,
      roman: (mode === 'aeolian' ? '' : flat) + roman + (quality === 'dim' ? '°' : quality === 'aug' ? '+' : ''),
    };
  });
}

// ── 연습용 타브 ─────────────────────────

export interface DrillTabOptions {
  strings: number[];
  tuningLabel: string;
  bpm: number;
}

/** 음 나열(null = 쉼)을 칸에 차례로 채운 타브. legato면 같은 줄에서 이어지는 음에 해머링·풀링 */
function fillTab(seq: (PatternNote | null)[], grid: number, opts: DrillTabOptions, legato: boolean): TabData {
  const n = Math.max(1, Math.ceil(seq.length / grid));
  const tab: TabData = {
    version: 1,
    tuning: opts.strings,
    tuningLabel: opts.tuningLabel,
    bpm: opts.bpm,
    beatsPerBar: 4,
    measures: Array.from({ length: n }, () => emptyMeasure(grid, opts.strings.length)),
  };
  seq.forEach((note, i) => {
    if (!note) return;
    const prev = seq[i - 1];
    const tabNote: TabNote = { fret: note.fret };
    // 올라가면 해머링, 내려가면 풀링
    if (legato && prev && prev.si === note.si) tabNote.techs = [note.midi > prev.midi ? 'h' : 'p'];
    tab.measures[Math.floor(i / grid)].cells[i % grid][note.si] = tabNote;
  });
  return tab;
}

/**
 * 스케일 포지션 연습: 6연음(한 박에 6음)으로 올라갔다가(n음) 꼭대기를 다시 치지 않고 내려와(n-1음) 시작 음에서 멈춘다.
 * 3nps는 두 줄 = 한 박이라 박이 줄 바꿈과 맞는다. 남는 칸은 쉼표 (반복할 때 숨 돌릴 틈).
 */
export function scaleDrillTab(notes: PatternNote[], opts: DrillTabOptions & { legato: boolean }): TabData {
  const seq = [...notes, ...notes.slice(0, -1).reverse()];
  return fillTab(seq, 24, opts, opts.legato);
}

/**
 * 스윕 연습: 올라가는 n음 + 맨 위·맨 아래를 빼고 내려오는 n-2음을 한 바퀴로, 한 마디를 채울 만큼 반복.
 * 한 바퀴가 6의 배수면 6연음, 4의 배수면 16분음표.
 */
export function sweepCycle(notes: PatternNote[]): PatternNote[] {
  return [...notes, ...notes.slice(1, -1).reverse()];
}

export function sweepGrid(cycleLength: number): number {
  return cycleLength % 6 === 0 ? 24 : cycleLength % 4 === 0 ? 16 : 24;
}

/** 모양 하나를 한 마디씩 — 여러 모양을 주면 마디마다 다음 모양으로 (인버전 이어 치기). 마디마다 박 나눔이 다를 수 있다 */
export function sweepDrillTab(shapes: PatternNote[][], opts: DrillTabOptions): TabData {
  const measures = shapes.map((shape) => {
    const cycle = sweepCycle(shape);
    const grid = sweepGrid(cycle.length);
    const seq: (PatternNote | null)[] = [];
    const reps = Math.max(1, Math.floor(grid / cycle.length));
    for (let r = 0; r < reps; r++) seq.push(...cycle);
    // 한 마디를 다 못 채우면 남는 칸은 쉼
    while (seq.length < grid) seq.push(null);
    return fillTab(seq.slice(0, grid), grid, opts, true).measures[0];
  });
  return { ...fillTab([], 24, opts, false), measures };
}

// ── 자동 BPM 올리기 ───────────────────────

export interface BpmStepConfig {
  enabled: boolean;
  step: number;
  everyLoops: number;
  target: number;
}

/** completedLoops번째 바퀴를 마친 직후의 BPM */
export function bpmAfterLoop(bpm: number, completedLoops: number, cfg: BpmStepConfig): number {
  if (!cfg.enabled || completedLoops <= 0 || completedLoops % cfg.everyLoops !== 0 || bpm >= cfg.target) return bpm;
  return Math.min(cfg.target, bpm + cfg.step);
}

/** 지판에 그릴 범위 — 패턴 앞뒤로 한 칸씩, 최소 8칸 */
export function fretWindow(notes: PatternNote[], min = 8): { start: number; count: number } {
  const frets = notes.map((n) => n.fret);
  let start = Math.max(0, Math.min(...frets) - 1);
  let end = Math.max(...frets) + 1;
  if (end - start < min) {
    const extra = min - (end - start);
    start = Math.max(0, start - Math.floor(extra / 2));
    end = start + min;
  }
  return { start, count: end - start };
}
