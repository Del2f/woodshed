export interface Song {
  id: string;
  title: string;
  artist: string;
  /** 음원 폴더 기준 상대 경로 (예: "Metal/Track 01.mp3") */
  fileName: string;
  durationSec: number | null;
  bpm: number | null;
  musicalKey: string | null;
  tuning: string;
  createdAt: string;
  lastPracticedAt: string | null;
  lastLoopId: string | null;
}

export interface LoopSection {
  id: string;
  songId: string;
  name: string;
  start: number;
  end: number;
  /** 저장 당시 재생 속도 (1 = 100%) */
  speed: number;
  createdAt: string;
}

export interface PracticeSession {
  id: string;
  songId: string | null;
  startedAt: string;
  durationSec: number;
}

export interface BackupFile {
  app: 'woodshed';
  version: 1;
  exportedAt: string;
  songs: Song[];
  loops: LoopSection[];
  sessions: PracticeSession[];
}

export interface DataStore {
  readonly kind: 'local' | 'supabase';
  listSongs(): Promise<Song[]>;
  getSong(id: string): Promise<Song | null>;
  upsertSong(song: Song): Promise<void>;
  deleteSong(id: string): Promise<void>;
  listLoops(songId: string): Promise<LoopSection[]>;
  upsertLoop(loop: LoopSection): Promise<void>;
  deleteLoop(id: string): Promise<void>;
  addSession(session: PracticeSession): Promise<void>;
  listSessionsSince(iso: string): Promise<PracticeSession[]>;
  exportAll(): Promise<BackupFile>;
  importAll(backup: BackupFile): Promise<void>;
}

export const DEFAULT_TUNING = 'Standard (E)';

export const TUNINGS = ['Standard (E)', 'Eb (반음 다운)', 'Drop D', 'D Standard', 'Drop C', 'Drop B', '7현 Standard (B)', '7현 Drop A'];

export function isBackupFile(x: unknown): x is BackupFile {
  const b = x as BackupFile;
  return !!b && b.app === 'woodshed' && b.version === 1 && Array.isArray(b.songs) && Array.isArray(b.loops) && Array.isArray(b.sessions);
}
