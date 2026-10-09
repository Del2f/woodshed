import { uid } from '../../lib/format';
import type { Lick } from '../../lib/store/types';
import { TUNING_PRESETS } from '../tuner/pitch';
import { emptyTab } from '../tab/model';
import { isDue, newSrs } from './srs';

export const SUGGESTED_TAGS = ['솔로', '리프', '갤럽', '스윕', '레가토', '태핑', '아르페지오', '펜타토닉', '하모닉마이너', '팜뮤트', '코드'];

export function tuningFor(label: string | null | undefined) {
  return TUNING_PRESETS.find((t) => t.label === label) ?? TUNING_PRESETS[0];
}

export function newLick(opts: {
  title?: string;
  songId?: string | null;
  source?: Lick['source'];
  tuningLabel?: string | null;
  bpm?: number | null;
  measures?: number;
  now?: Date;
}): Lick {
  const now = opts.now ?? new Date();
  const tuning = tuningFor(opts.tuningLabel);
  const bpm = Math.round(Math.min(300, Math.max(30, opts.bpm ?? 120)));
  return {
    id: uid(),
    title: opts.title?.trim() || '새 릭',
    songId: opts.songId ?? null,
    source: opts.source ?? null,
    tags: [],
    memo: '',
    favorite: false,
    tab: emptyTab(tuning.strings, tuning.label, bpm, Math.min(16, Math.max(1, opts.measures ?? 2))),
    bpmGoal: null,
    bpmLog: [],
    srs: newSrs(now),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

/** 오늘 복습할 릭 — 오래 밀린 것부터 */
export function dueLicks(licks: Lick[], now = new Date()): Lick[] {
  return licks.filter((l) => isDue(l.srs, now)).sort((a, b) => a.srs.dueAt.localeCompare(b.srs.dueAt));
}

export function bestBpm(l: Lick): number | null {
  return l.bpmLog.length ? Math.max(...l.bpmLog.map((x) => x.bpm)) : null;
}

export function allTags(licks: Lick[]): string[] {
  const seen = new Map<string, number>();
  for (const l of licks) for (const t of l.tags) seen.set(t, (seen.get(t) ?? 0) + 1);
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

/** 원곡 구간이 몇 마디인지 — 분석이 있으면 마디 시작점으로 세고, 없으면 BPM으로 어림 (1–16) */
export function measuresForRange(start: number, end: number, downbeats: number[] | null, bpm: number | null): number {
  let n: number;
  if (downbeats && downbeats.length > 1) {
    // 구간 안에서 새로 시작하는 마디 수 + 첫 마디. 끝 바로 앞(0.1초)의 마디 시작은 다음 구간 몫
    const inside = downbeats.filter((d) => d > start + 0.1 && d < end - 0.1).length;
    n = inside + 1;
  } else {
    const bar = (60 / (bpm ?? 120)) * 4;
    n = Math.ceil((end - start) / bar - 0.15);
  }
  return Math.min(16, Math.max(1, n));
}
