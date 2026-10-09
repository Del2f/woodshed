/** 초 → "m:ss" */
export function formatTime(sec: number): string {
  const s = Number.isFinite(sec) && sec > 0 ? sec : 0;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

/** 초 → "4시간 50분" / "35분" */
export function formatDuration(totalSec: number): string {
  const totalMin = Math.round(totalSec / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

const AUDIO_EXT = /\.(mp3|wav|flac|m4a|aac|ogg|opus)$/i;

export function isAudioFile(name: string): boolean {
  return AUDIO_EXT.test(name);
}

/** "Artist - Title.mp3" → { artist, title }. 하이픈이 없으면 artist는 빈 문자열. */
export function parseTitleFromFileName(path: string): { title: string; artist: string } {
  const base = path.split(/[\\/]/).pop() ?? path;
  const stem = base.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
  const idx = stem.indexOf(' - ');
  if (idx > 0) {
    return { artist: stem.slice(0, idx).trim(), title: stem.slice(idx + 3).trim() };
  }
  return { artist: '', title: stem };
}

export const KEY_OPTIONS = [
  'C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B',
  'Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm',
];

/** "Em" → "E 마이너", "G" → "G 메이저" */
export function keyLabel(key: string | null): string {
  if (!key) return '키 미정';
  return key.endsWith('m') ? `${key.slice(0, -1)} 마이너` : `${key} 메이저`;
}

/** 월요일 0시(로컬) */
export function startOfWeek(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = (d.getDay() + 6) % 7; // 월=0 … 일=6
  d.setDate(d.getDate() - day);
  return d;
}

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** 이번 주(월~일) 요일별 연습 '초' */
export function weekBuckets(sessions: { startedAt: string; durationSec: number }[], now: Date): number[] {
  const start = startOfWeek(now).getTime();
  const out = [0, 0, 0, 0, 0, 0, 0];
  for (const s of sessions) {
    const t = new Date(s.startedAt).getTime();
    const idx = Math.floor((t - start) / 86_400_000);
    if (idx >= 0 && idx < 7) out[idx] += s.durationSec;
  }
  return out;
}

/** 오늘(또는 어제)까지 이어진 연속 연습 일수 */
export function practiceStreak(sessions: { startedAt: string }[], now: Date): number {
  const days = new Set(sessions.map((s) => dayKey(new Date(s.startedAt))));
  const cur = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!days.has(dayKey(cur))) cur.setDate(cur.getDate() - 1);
  let streak = 0;
  while (days.has(dayKey(cur))) {
    streak++;
    cur.setDate(cur.getDate() - 1);
  }
  return streak;
}

export function uid(): string {
  return crypto.randomUUID();
}
