import { parseTitleFromFileName, uid } from './format';
import { DEFAULT_TUNING, type Song } from './store/types';

export function newSong(path: string): Song {
  const { title, artist } = parseTitleFromFileName(path);
  return {
    id: uid(),
    title,
    artist,
    fileName: path,
    durationSec: null,
    bpm: null,
    musicalKey: null,
    tuning: DEFAULT_TUNING,
    createdAt: new Date().toISOString(),
    lastPracticedAt: null,
    lastLoopId: null,
  };
}

const TILES = [
  { bg: '#3A2410', fg: '#FFB340' },
  { bg: '#0F2440', fg: '#7DBBFF' },
  { bg: '#0E2E2A', fg: '#5EE0C8' },
  { bg: '#241433', fg: '#D2A8FF' },
  { bg: '#2E1418', fg: '#FF8A9A' },
  { bg: '#232325', fg: '#E5E5EA' },
];

/** 곡마다 고정된 타일 색 */
export function tileColor(id: string): { bg: string; fg: string } {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TILES[h % TILES.length];
}

export function relativeDay(iso: string, now = new Date()): string {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const d = new Date(iso);
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((a - b) / 86_400_000);
  if (diff <= 0) return '오늘';
  if (diff === 1) return '어제';
  if (diff < 7) return `${diff}일 전`;
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}
