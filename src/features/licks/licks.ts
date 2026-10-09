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
