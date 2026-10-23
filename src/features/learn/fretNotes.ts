/**
 * 레슨 1 '지판 음 이름' — 지판 위 음 계산과 퀴즈 문제 만들기·채점.
 * strings는 앱 전체와 같이 낮은 줄 → 높은 줄 MIDI 번호. si = 그 배열의 인덱스(0 = 가장 낮은 줄).
 */

import { parseChord, parseKey } from '../../lib/theory';
import type { SongAnalysis } from '../../lib/store/types';

export const NATURAL_PCS = [0, 2, 4, 5, 7, 9, 11];
export const isNatural = (pc: number) => NATURAL_PCS.includes(((pc % 12) + 12) % 12);

/** 답 단추에 쓰는 이름: 샵·플랫 두 가지 철자를 같이 */
export const PC_LABELS: { main: string; alt?: string }[] = [
  { main: 'C' }, { main: 'C#', alt: 'Db' }, { main: 'D' }, { main: 'D#', alt: 'Eb' }, { main: 'E' }, { main: 'F' },
  { main: 'F#', alt: 'Gb' }, { main: 'G' }, { main: 'G#', alt: 'Ab' }, { main: 'A' }, { main: 'A#', alt: 'Bb' }, { main: 'B' },
];

export const pcLabel = (pc: number) => {
  const l = PC_LABELS[((pc % 12) + 12) % 12];
  return l.alt ? `${l.main}/${l.alt}` : l.main;
};

export interface Spot {
  si: number;
  fret: number;
}

export const midiAt = (strings: number[], s: Spot) => strings[s.si] + s.fret;
export const pcAt = (strings: number[], s: Spot) => midiAt(strings, s) % 12;

/** 기타리스트식 줄 번호: 1 = 가장 높은 줄 */
export const stringNumber = (strings: number[], si: number) => strings.length - si;

export function positionsOf(strings: number[], pc: number, maxFret: number, onStrings?: number[]): Spot[] {
  const out: Spot[] = [];
  strings.forEach((open, si) => {
    if (onStrings && !onStrings.includes(si)) return;
    for (let fret = ((pc - open) % 12 + 12) % 12; fret <= maxFret; fret += 12) out.push({ si, fret });
  });
  return out;
}

/** 두 줄 위의 한 옥타브 위 자리 (손가락 모양으로 옥타브 찾기). 지판 밖이면 null */
export function octaveUp(strings: number[], s: Spot, maxFret = 24): Spot | null {
  const si = s.si + 2;
  if (si >= strings.length) return null;
  const fret = midiAt(strings, s) + 12 - strings[si];
  return fret >= 0 && fret <= maxFret ? { si, fret } : null;
}

/** 두 줄 아래의 한 옥타브 아래 자리 */
export function octaveDown(strings: number[], s: Spot, maxFret = 24): Spot | null {
  const si = s.si - 2;
  if (si < 0) return null;
  const fret = midiAt(strings, s) - 12 - strings[si];
  return fret >= 0 && fret <= maxFret ? { si, fret } : null;
}

/** 이 자리에서 옥타브 모양을 위아래로 이어 간 자리들 (자기 자신 제외) */
export function octaveChain(strings: number[], s: Spot, maxFret: number): Spot[] {
  const out: Spot[] = [];
  for (let p = octaveDown(strings, s, maxFret); p; p = octaveDown(strings, p, maxFret)) out.unshift(p);
  for (let p = octaveUp(strings, s, maxFret); p; p = octaveUp(strings, p, maxFret)) out.push(p);
  return out;
}

/** 'n번 줄 → n-2번 줄: 두 칸 오른쪽' 같은 옥타브 모양 설명용 — 줄마다 몇 칸 옮기는지 */
export function octaveShifts(strings: number[]): { from: number; to: number; shift: number }[] {
  return strings.slice(0, -2).map((open, si) => ({
    from: stringNumber(strings, si),
    to: stringNumber(strings, si + 2),
    shift: open + 12 - strings[si + 2],
  }));
}

// ── 퀴즈 ─────────────────────────────

export type QuizMode = 'name' | 'find';
/** 어느 줄에서 낼지: 가장 낮은 줄 / 낮은 두 줄 / 전체 */
export type QuizScope = 'low1' | 'low2' | 'all';

export interface QuizSettings {
  mode: QuizMode;
  scope: QuizScope;
  naturalsOnly: boolean;
  maxFret: number;
}

export interface Question {
  mode: QuizMode;
  /** name: 이 자리의 음 이름을 묻는다 / find: 이 줄에서 이 음(pc)을 찾는다. fret은 정답 중 하나 */
  spot: Spot;
  pc: number;
}

export function scopeStrings(strings: number[], scope: QuizScope): number[] {
  const n = scope === 'low1' ? 1 : scope === 'low2' ? 2 : strings.length;
  return Array.from({ length: Math.min(n, strings.length) }, (_, i) => i);
}

export function scopeLabel(strings: number[], scope: QuizScope): string {
  if (scope === 'all') return '모든 줄';
  return scopeStrings(strings, scope).map((si) => stringNumber(strings, si)).join('·') + '번 줄';
}

/** 문제 하나. 직전 문제와 같은 자리·같은 음은 피한다 */
export function makeQuestion(strings: number[], s: QuizSettings, random: () => number = Math.random, prev?: Question | null): Question {
  const pool: Spot[] = [];
  for (const si of scopeStrings(strings, s.scope)) {
    for (let fret = 0; fret <= s.maxFret; fret++) {
      if (!s.naturalsOnly || isNatural(strings[si] + fret)) pool.push({ si, fret });
    }
  }
  const fresh = pool.filter((p) => !prev || (pcAt(strings, p) !== prev.pc && !(p.si === prev.spot.si && p.fret === prev.spot.fret)));
  const from = fresh.length ? fresh : pool;
  const spot = from[Math.floor(random() * from.length) % from.length];
  return { mode: s.mode, spot, pc: pcAt(strings, spot) };
}

/** 한 판(n문제). 같은 음이 너무 몰리지 않도록 직전 문제를 넘겨 가며 만든다 */
export function makeRound(strings: number[], s: QuizSettings, n: number, random: () => number = Math.random): Question[] {
  const out: Question[] = [];
  for (let i = 0; i < n; i++) out.push(makeQuestion(strings, s, random, out[i - 1]));
  return out;
}

/** 틀린 문제만 다시 — 순서를 섞어서 */
export function retryRound(missed: Question[], random: () => number = Math.random): Question[] {
  const q = [...missed];
  for (let i = q.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [q[i], q[j]] = [q[j], q[i]];
  }
  return q;
}

export const checkName = (q: Question, pc: number) => ((pc % 12) + 12) % 12 === q.pc;

/** find: 그 줄에서 그 음이면 어느 옥타브든 정답 (0프렛과 12프렛 모두) */
export const checkFind = (strings: number[], q: Question, s: Spot) => s.si === q.spot.si && pcAt(strings, s) === q.pc;

export interface Answer {
  q: Question;
  ok: boolean;
  ms: number;
}

export function summarize(answers: Answer[]) {
  const correct = answers.filter((a) => a.ok).length;
  const avgMs = answers.length ? answers.reduce((t, a) => t + a.ms, 0) / answers.length : 0;
  return { correct, total: answers.length, avgMs, missed: answers.filter((a) => !a.ok).map((a) => a.q) };
}

// ── 내 곡에서 ─────────────────────────────

/** 분석 결과에서 오래 울린 코드의 근음 순으로 (같은 근음은 한 번만). 'N'과 해석 못 한 표기는 건너뛴다 */
export function songRoots(analysis: SongAnalysis | null, keyName: string | null, limit = 6): { pc: number; name: string; chords: string[] }[] {
  const byRoot = new Map<number, { name: string; dur: number; chords: Set<string> }>();
  for (const seg of analysis?.chords ?? []) {
    const c = parseChord(seg.label);
    if (!c) continue;
    const e = byRoot.get(c.root) ?? { name: c.rootName, dur: 0, chords: new Set<string>() };
    e.dur += seg.end - seg.start;
    e.chords.add(c.label);
    byRoot.set(c.root, e);
  }
  const out = [...byRoot.entries()].sort((a, b) => b[1].dur - a[1].dur).map(([pc, e]) => ({ pc, name: e.name, chords: [...e.chords] }));
  // 코드 분석이 없으면 키의 으뜸음이라도
  const key = parseKey(keyName ?? analysis?.key.name);
  if (key && !out.some((r) => r.pc === key.tonic)) out.push({ pc: key.tonic, name: key.tonicName, chords: [] });
  return out.slice(0, limit);
}
