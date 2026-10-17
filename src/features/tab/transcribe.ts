import { MAX_FRET, emptyMeasure, type TabData, type TabNote, type Tech } from './model';

/**
 * 엔진이 받아 적은 음(시각·음높이)을 타브로: 박자 칸에 맞추고, 손 움직임이 가장 적은 줄·프렛을 고른다.
 */

/** 엔진 /transcribe 가 돌려주는 음 하나 (곡 시간 기준, 초) */
export interface HeardNote {
  start: number;
  end: number;
  midi: number;
  amp: number;
  /** 시작 세기 0–1. 피킹한 음은 크고, 레가토·벤딩으로 이어진 음은 작다 */
  onset: number;
  /** 밀어 올린 폭(반음). 0이면 벤딩 없음 */
  bend: number;
}

export type Sensitivity = 'low' | 'mid' | 'high';
/** 민감도별 최소 시작 세기 — 높을수록 확실한 음만 */
export const SENSITIVITY: Record<Sensitivity, number> = { low: 0.7, mid: 0.5, high: 0.35 };

/** 마디 경계 count+1개. 분석의 마디 시작점이 있으면 그걸, 없으면 BPM으로 */
export function barBounds(start: number, downbeats: number[] | null, bpm: number, count: number, beatsPerBar = 4): number[] {
  const fallbackBar = (60 / bpm) * beatsPerBar;
  const bounds: number[] = [];
  if (downbeats && downbeats.length > 1) {
    // measuresForRange와 같은 기준: 구간 시작(+0.1초) 이전의 마지막 마디 시작이 첫 마디
    const before = downbeats.filter((d) => d <= start + 0.1);
    bounds.push(before.length ? before[before.length - 1] : start);
    for (const d of downbeats) {
      if (bounds.length > count) break;
      if (d > bounds[bounds.length - 1] + 0.1) bounds.push(d);
    }
  } else {
    bounds.push(start);
  }
  while (bounds.length <= count) {
    const n = bounds.length;
    const bar = n >= 2 ? bounds[n - 1] - bounds[n - 2] : fallbackBar;
    bounds.push(bounds[n - 1] + bar);
  }
  return bounds;
}

/** 곡 시각 → (마디, 칸). grids = 마디별 칸 수. 범위 밖이면 null */
export function slotOf(t: number, bounds: number[], grids: number[]): { m: number; s: number } | null {
  if (t < bounds[0] - 0.08) return null;
  let m = 0;
  while (m < bounds.length - 2 && t >= bounds[m + 1]) m++;
  const len = bounds[m + 1] - bounds[m];
  const grid = grids[m] ?? 16;
  let s = Math.round(((t - bounds[m]) / len) * grid);
  if (s <= 0) s = 0; // -0도 0으로
  if (s >= grid) {
    if (m + 1 >= bounds.length - 1) return null;
    m += 1;
    s = 0;
  }
  return { m, s };
}

interface Placed {
  midi: number;
  str: number;
  fret: number;
}

interface Candidate {
  notes: Placed[];
  /** 누른 프렛의 평균 (손 위치). 개방현만 있으면 null */
  pos: number | null;
  cost: number;
}

const MAX_SPAN = 5; // 한 번에 누를 수 있는 프렛 폭

/** 한 번에 울리는 음들(낮은 음부터)을 줄·프렛에 놓는 모든 방법 중 그럴듯한 것들 */
export function candidates(pitches: number[], tuning: number[], bends: Map<number, number> = new Map()): Candidate[] {
  const out: Candidate[] = [];
  const opts = pitches.map((p) =>
    tuning
      .map((open, str) => ({ midi: p, str, fret: p - open }))
      .filter((o) => o.fret >= 0 && o.fret <= MAX_FRET && !(o.fret === 0 && bends.get(p))),
  );
  const pick: Placed[] = [];
  const used = new Set<number>();
  const walk = (i: number) => {
    if (out.length > 400) return;
    if (i === opts.length) {
      const fretted = pick.filter((p) => p.fret > 0).map((p) => p.fret);
      const lo = Math.min(...fretted);
      const hi = Math.max(...fretted);
      const span = fretted.length ? hi - lo : 0;
      if (span > MAX_SPAN) return;
      const cost =
        pick.reduce((c, p) => c + p.fret * 0.04 + (p.fret > 17 ? 0.3 : 0), 0) + (span > 3 ? (span - 3) * 1.5 : 0) + crossing(pick) * 0.8;
      out.push({ notes: [...pick], pos: fretted.length ? fretted.reduce((a, b) => a + b, 0) / fretted.length : null, cost });
      return;
    }
    for (const o of opts[i]) {
      if (used.has(o.str)) continue;
      used.add(o.str);
      pick.push(o);
      walk(i + 1);
      pick.pop();
      used.delete(o.str);
    }
  };
  walk(0);
  return out.sort((a, b) => a.cost - b.cost).slice(0, 40);
}

/** 화음에서 높은 음이 더 낮은 줄에 놓이면(줄 꼬임) 벌점 — 실제로는 거의 안 잡는 모양 */
function crossing(pick: Placed[]): number {
  let n = 0;
  for (let i = 0; i < pick.length; i++) for (let j = i + 1; j < pick.length; j++) if (pick[j].midi > pick[i].midi && pick[j].str < pick[i].str) n++;
  return n;
}

export interface DraftResult {
  tab: TabData;
  placed: number;
  /** 줄 범위를 벗어났거나 칸에 못 맞춘 음 */
  skipped: number;
}

/**
 * 받아 적은 음으로 새 타브를 만든다. 마디 수·칸·튜닝·BPM은 기존 타브를 따른다.
 * 같은 칸에 동시에 시작한 음은 화음으로 놓고, 줄 수보다 많으면 센 음부터 남긴다.
 */
export function draftTab(base: TabData, heard: HeardNote[], bounds: number[], minOnset: number): DraftResult {
  const strings = base.tuning.length;
  const lowest = Math.min(...base.tuning);
  const highest = Math.max(...base.tuning) + MAX_FRET;
  const measures = base.measures.map((m) => emptyMeasure(m.grid, strings));
  let skipped = 0;

  // 1) 칸마다 모으기
  type Event = { m: number; s: number; t: number; notes: HeardNote[] };
  const events = new Map<string, Event>();
  for (const n of heard) {
    if (n.onset < minOnset) continue;
    if (n.midi < lowest || n.midi > highest) {
      skipped++;
      continue;
    }
    const at = slotOf(
      n.start,
      bounds,
      measures.map((m) => m.grid),
    );
    if (!at || at.m >= measures.length) {
      skipped++;
      continue;
    }
    const key = `${at.m}:${at.s}`;
    const ev = events.get(key) ?? { m: at.m, s: at.s, t: n.start, notes: [] };
    if (!ev.notes.some((x) => x.midi === n.midi)) ev.notes.push(n);
    events.set(key, ev);
  }
  const seq = [...events.values()].sort((a, b) => a.m - b.m || a.s - b.s);
  for (const ev of seq) {
    if (ev.notes.length > strings) {
      skipped += ev.notes.length - strings;
      ev.notes = [...ev.notes].sort((a, b) => b.amp - a.amp).slice(0, strings);
    }
    ev.notes.sort((a, b) => a.midi - b.midi);
  }

  // 2) 줄·프렛 고르기 — 손 위치 이동이 가장 적은 길 (비터비)
  const cands = seq.map((ev) => {
    const bends = new Map(ev.notes.map((n) => [n.midi, n.bend]));
    let c = candidates(
      ev.notes.map((n) => n.midi),
      base.tuning,
      bends,
    );
    // 놓을 수 없는 화음이면 약한 음부터 하나씩 뺀다
    while (!c.length && ev.notes.length > 1) {
      const weakest = ev.notes.reduce((w, n) => (n.amp < w.amp ? n : w));
      ev.notes = ev.notes.filter((n) => n !== weakest);
      skipped++;
      c = candidates(
        ev.notes.map((n) => n.midi),
        base.tuning,
        bends,
      );
    }
    return c;
  });
  const keep = seq.map((_, i) => cands[i].length > 0);
  const evs = seq.filter((_, i) => keep[i]);
  const cs = cands.filter((_, i) => keep[i]);
  skipped += seq.length - evs.length;

  const move = (a: number | null, b: number | null, gap: number) => {
    if (a === null || b === null) return 0;
    const d = Math.abs(a - b);
    return (d > 4 ? d * 0.6 + 1 : d * 0.35) * (gap > 1 ? 0.3 : 1);
  };
  /** 피킹 없이 바로 이어지는 단음(해머링·풀링 후보)은 같은 줄에 있어야 자연스럽다 */
  const legato = (i: number) => {
    const a = evs[i - 1].notes;
    const b = evs[i].notes;
    return a.length === 1 && b.length === 1 && b[0].onset < 0.6 && b[0].start - a[0].end < 0.04 && a[0].midi !== b[0].midi;
  };
  const score: number[][] = [];
  const back: number[][] = [];
  const posOf: (number | null)[][] = []; // 개방현만 친 칸은 앞 손 위치를 이어받는다
  cs.forEach((list, i) => {
    score.push([]);
    back.push([]);
    posOf.push([]);
    list.forEach((c, j) => {
      if (i === 0) {
        score[i][j] = c.cost + (c.pos ?? 0) * 0.05;
        back[i][j] = -1;
        posOf[i][j] = c.pos;
        return;
      }
      const gap = evs[i].t - evs[i - 1].t;
      const tied = legato(i);
      let best = Infinity;
      let arg = 0;
      cs[i - 1].forEach((pc, k) => {
        const split = tied && pc.notes[0].str !== c.notes[0].str ? 2 : 0;
        const v = score[i - 1][k] + move(posOf[i - 1][k], c.pos, gap) + split;
        if (v < best) {
          best = v;
          arg = k;
        }
      });
      score[i][j] = best + c.cost;
      back[i][j] = arg;
      posOf[i][j] = c.pos ?? posOf[i - 1][arg];
    });
  });
  const choice: number[] = new Array(cs.length);
  if (cs.length) {
    const last = cs.length - 1;
    choice[last] = score[last].indexOf(Math.min(...score[last]));
    for (let i = last; i > 0; i--) choice[i - 1] = back[i][choice[i]];
  }

  // 3) 타브에 적기 + 레가토(해머링·풀링) 추정
  const lastOnString = new Map<number, { fret: number; end: number }>();
  let placed = 0;
  evs.forEach((ev, i) => {
    const c = cs[i][choice[i]];
    for (const p of c.notes) {
      const heardNote = ev.notes.find((n) => n.midi === p.midi)!;
      const techs: Tech[] = [];
      const note: TabNote = { fret: p.fret };
      if (heardNote.bend > 0) {
        techs.push('bend');
        note.bend = heardNote.bend;
      }
      const prev = lastOnString.get(p.str);
      if (prev && !techs.length && heardNote.onset < 0.6 && heardNote.start - prev.end < 0.04 && prev.fret !== p.fret) {
        techs.push(p.fret > prev.fret ? 'h' : 'p');
      }
      if (techs.length) note.techs = techs;
      measures[ev.m].cells[ev.s][p.str] = note;
      lastOnString.set(p.str, { fret: p.fret, end: heardNote.end });
      placed++;
    }
  });

  return { tab: { ...base, measures }, placed, skipped };
}
