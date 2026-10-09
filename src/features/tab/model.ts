import { uid } from '../../lib/format';

/**
 * 타브 데이터 — 마디마다 '칸(grid)'이 있는 격자.
 * 4/4 한 마디 = 16칸이면 한 칸이 16분음표. 칸 × 줄에 프렛 번호와 주법을 적는다.
 * 줄 번호는 낮은 줄부터 0 (6현이면 0 = 6번 줄 E, 5 = 1번 줄 e). 화면에는 높은 줄을 위에 그린다.
 */

export type Tech = 'h' | 'p' | 'slideUp' | 'slideDown' | 'bend' | 'vibrato' | 'mute' | 'harmonic' | 'tap';

export interface TabNote {
  fret: number;
  techs?: Tech[];
  /** 벤딩 폭(반음). 기본 1 = 온음 벤딩은 2 */
  bend?: number;
}

export interface TabMeasure {
  id: string;
  /** 한 마디의 칸 수: 8(8분), 12(셋잇단 8분), 16(16분), 24(셋잇단 16분) */
  grid: number;
  /** cells[칸][줄] */
  cells: (TabNote | null)[][];
  /** 칸마다 팜뮤트 */
  pm: boolean[];
}

export interface TabData {
  version: 1;
  /** 낮은 줄 → 높은 줄 MIDI 번호 */
  tuning: number[];
  tuningLabel: string;
  bpm: number;
  beatsPerBar: number;
  measures: TabMeasure[];
}

export const GRIDS = [
  { value: 8, label: '8분' },
  { value: 16, label: '16분' },
  { value: 12, label: '셋잇단' },
  { value: 24, label: '16분 셋잇단' },
];

export const MAX_FRET = 24;


const newId = () => uid();

export function emptyMeasure(grid: number, strings: number): TabMeasure {
  return {
    id: newId(),
    grid,
    cells: Array.from({ length: grid }, () => Array.from({ length: strings }, () => null)),
    pm: Array.from({ length: grid }, () => false),
  };
}

export function emptyTab(tuning: number[], tuningLabel: string, bpm = 120, measures = 2, grid = 16): TabData {
  return { version: 1, tuning, tuningLabel, bpm, beatsPerBar: 4, measures: Array.from({ length: measures }, () => emptyMeasure(grid, tuning.length)) };
}

function mapMeasure(tab: TabData, m: number, fn: (meas: TabMeasure) => TabMeasure): TabData {
  return { ...tab, measures: tab.measures.map((x, i) => (i === m ? fn(x) : x)) };
}

export function setNote(tab: TabData, m: number, slot: number, str: number, note: TabNote | null): TabData {
  return mapMeasure(tab, m, (meas) => ({
    ...meas,
    cells: meas.cells.map((col, s) => (s === slot ? col.map((c, i) => (i === str ? note : c)) : col)),
  }));
}

export function getNote(tab: TabData, m: number, slot: number, str: number): TabNote | null {
  return tab.measures[m]?.cells[slot]?.[str] ?? null;
}

/** 주법 켜기/끄기. 슬라이드 위/아래, 해머링/풀링, 뮤트/하모닉스는 서로 배타 */
const EXCLUSIVE: Tech[][] = [['slideUp', 'slideDown'], ['h', 'p', 'tap'], ['mute', 'harmonic']];

export function toggleTech(tab: TabData, m: number, slot: number, str: number, tech: Tech): TabData {
  const note = getNote(tab, m, slot, str);
  if (!note) return tab;
  const has = note.techs?.includes(tech);
  let techs = (note.techs ?? []).filter((t) => t !== tech);
  if (!has) {
    const group = EXCLUSIVE.find((g) => g.includes(tech));
    if (group) techs = techs.filter((t) => !group.includes(t));
    techs = [...techs, tech];
  }
  const next: TabNote = { ...note, techs: techs.length ? techs : undefined };
  if (tech === 'bend') next.bend = has ? undefined : (note.bend ?? 2);
  return setNote(tab, m, slot, str, next);
}

export function togglePM(tab: TabData, m: number, slot: number): TabData {
  return mapMeasure(tab, m, (meas) => ({ ...meas, pm: meas.pm.map((v, i) => (i === slot ? !v : v)) }));
}

export function insertMeasure(tab: TabData, after: number, copyFrom?: number): TabData {
  const src = copyFrom !== undefined ? tab.measures[copyFrom] : undefined;
  const meas = src
    ? { ...src, id: newId(), cells: src.cells.map((c) => c.map((n) => (n ? { ...n, techs: n.techs ? [...n.techs] : undefined } : null))), pm: [...src.pm] }
    : emptyMeasure(tab.measures[after]?.grid ?? 16, tab.tuning.length);
  const measures = [...tab.measures];
  measures.splice(after + 1, 0, meas);
  return { ...tab, measures };
}

export function deleteMeasure(tab: TabData, m: number): TabData {
  if (tab.measures.length <= 1) return { ...tab, measures: [emptyMeasure(tab.measures[0]?.grid ?? 16, tab.tuning.length)] };
  return { ...tab, measures: tab.measures.filter((_, i) => i !== m) };
}

/** 칸 수를 바꾼다. 같은 시점에 놓이는 음은 옮기고, 새 격자에 맞지 않는 음은 가장 가까운 칸으로 */
export function changeGrid(tab: TabData, m: number, grid: number): TabData {
  return mapMeasure(tab, m, (meas) => {
    const next = emptyMeasure(grid, tab.tuning.length);
    next.id = meas.id;
    meas.cells.forEach((col, s) => {
      const target = Math.min(grid - 1, Math.round((s / meas.grid) * grid));
      col.forEach((n, str) => {
        if (n && !next.cells[target][str]) next.cells[target][str] = n;
      });
      if (meas.pm[s]) next.pm[target] = true;
    });
    return next;
  });
}

/** 튜닝을 바꾼다. 줄 수가 달라지면 높은 줄 기준으로 맞춘다 (7현 → 6현이면 가장 낮은 줄을 버림) */
export function changeTuning(tab: TabData, tuning: number[], label: string): TabData {
  const diff = tuning.length - tab.tuning.length;
  const remap = (col: (TabNote | null)[]) =>
    diff >= 0 ? [...Array.from({ length: diff }, () => null), ...col] : col.slice(-diff);
  return { ...tab, tuning, tuningLabel: label, measures: tab.measures.map((meas) => ({ ...meas, cells: meas.cells.map(remap) })) };
}

export function isEmpty(tab: TabData): boolean {
  return tab.measures.every((meas) => meas.cells.every((col) => col.every((n) => !n)));
}

// ── 재생용 이벤트 ─────────────────────────

export interface PlayEvent {
  /** 시작 시각(초, 타브 처음 기준) */
  time: number;
  /** 소리 길이(초) — 같은 줄의 다음 음까지, 최대 2초 */
  dur: number;
  str: number;
  midi: number;
  fret: number;
  techs: Tech[];
  bend: number;
  pm: boolean;
  measure: number;
  slot: number;
}

export function slotSeconds(tab: TabData, meas: TabMeasure): number {
  return ((60 / tab.bpm) * tab.beatsPerBar) / meas.grid;
}

/** 마디마다 시작 시각(초) + 맨 끝 */
export function measureStarts(tab: TabData): number[] {
  const bar = (60 / tab.bpm) * tab.beatsPerBar;
  return Array.from({ length: tab.measures.length + 1 }, (_, i) => i * bar);
}

export function tabDuration(tab: TabData): number {
  return tab.measures.length * (60 / tab.bpm) * tab.beatsPerBar;
}

export function toEvents(tab: TabData): PlayEvent[] {
  const starts = measureStarts(tab);
  const total = starts[starts.length - 1];
  const events: PlayEvent[] = [];
  tab.measures.forEach((meas, m) => {
    const sd = slotSeconds(tab, meas);
    meas.cells.forEach((col, s) => {
      col.forEach((n, str) => {
        if (!n) return;
        events.push({
          time: starts[m] + s * sd,
          dur: 0,
          str,
          midi: tab.tuning[str] + n.fret,
          fret: n.fret,
          techs: n.techs ?? [],
          bend: n.bend ?? 0,
          pm: meas.pm[s],
          measure: m,
          slot: s,
        });
      });
    });
  });
  events.sort((a, b) => a.time - b.time || a.str - b.str);
  // 한 줄에서는 다음 음이 나오면 앞 음이 멎는다
  const lastOn: (PlayEvent | undefined)[] = [];
  for (const e of events) {
    const prev = lastOn[e.str];
    if (prev) prev.dur = Math.min(2, e.time - prev.time);
    lastOn[e.str] = e;
  }
  for (const e of lastOn) if (e) e.dur = Math.min(2, Math.max(0.05, total - e.time));
  return events;
}

// ── 텍스트 타브 (복사·붙여넣기용) ─────────────────────────

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** 칸 하나의 표기: 12, h12, /5, 15b17~, x, <12> */
export function cellText(n: TabNote | null): string {
  if (!n) return '';
  const t = n.techs ?? [];
  let s = t.includes('mute') ? 'x' : t.includes('harmonic') ? `<${n.fret}>` : String(n.fret);
  if (t.includes('h')) s = `h${s}`;
  if (t.includes('p')) s = `p${s}`;
  if (t.includes('tap')) s = `t${s}`;
  if (t.includes('slideUp')) s = `/${s}`;
  if (t.includes('slideDown')) s = `\\${s}`;
  if (t.includes('bend')) s += `b${n.fret + (n.bend ?? 2)}`;
  if (t.includes('vibrato')) s += '~';
  return s;
}

/** 일반 텍스트 타브. 높은 줄이 위, 마디는 | 로 구분 */
export function toAscii(tab: TabData): string {
  const n = tab.tuning.length;
  const widths = tab.measures.map((meas) => meas.cells.map((col) => Math.max(1, ...col.map((c) => cellText(c).length))));
  const lines: string[] = [];
  const hasPM = tab.measures.some((meas) => meas.pm.some(Boolean));
  if (hasPM) {
    let pm = '  ';
    tab.measures.forEach((meas, m) => {
      pm += ' ';
      meas.cells.forEach((_, s) => (pm += (meas.pm[s] ? 'PM' : '').padEnd(widths[m][s] + 1, meas.pm[s] ? '-' : ' ')));
    });
    lines.push(pm.trimEnd());
  }
  for (let str = n - 1; str >= 0; str--) {
    const name = NAMES[tab.tuning[str] % 12];
    let line = `${str === n - 1 ? name.toLowerCase() : name}`.padEnd(2, ' ') + '|';
    tab.measures.forEach((meas, m) => {
      meas.cells.forEach((col, s) => {
        line += cellText(col[str]).padEnd(widths[m][s], '-') + '-';
      });
      line += '|';
    });
    lines.push(line);
  }
  return lines.join('\n');
}
