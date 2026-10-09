import type { SrsState } from '../../features/licks/srs';
import type { TabData } from '../../features/tab/model';

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

export interface ChordSegment {
  start: number;
  end: number;
  /** 'Em', 'C', 'B7', 'E5', 코드 없음은 'N' */
  label: string;
}

/** 로컬 분석 엔진 결과 (engine/woodshed_engine/server.py) */
export interface SongAnalysis {
  songId: string;
  version: number;
  engineVersion: string;
  analyzedAt: string;
  fileHash: string;
  duration: number;
  bpm: number;
  beatsPerBar: number;
  beats: number[];
  downbeats: number[];
  key: { name: string; tonic: number; mode: 'major' | 'minor'; confidence: number };
  chords: ChordSegment[];
  /** 엔진에 저장된 분리 트랙 이름 ('guitar', 'no_guitar') */
  stems: string[];
}

/** 카피한 프레이즈 하나 — 타브 + (있으면) 원곡 구간 + 복습 일정 */
export interface Lick {
  id: string;
  title: string;
  /** 어느 곡에서 땄는지 (직접 적은 릭이면 null) */
  songId: string | null;
  /** 원곡에서의 구간과 저장할 때 속도 */
  source: { start: number; end: number; speed: number } | null;
  tags: string[];
  memo: string;
  favorite: boolean;
  tab: TabData;
  bpmGoal: number | null;
  /** 연습할 때 친 BPM 기록 */
  bpmLog: { at: string; bpm: number }[];
  srs: SrsState;
  createdAt: string;
  updatedAt: string;
}

export interface BackupFile {
  app: 'woodshed';
  version: 1;
  exportedAt: string;
  songs: Song[];
  loops: LoopSection[];
  sessions: PracticeSession[];
  /** v0.2부터 — 이전 백업에는 없을 수 있다 */
  analyses?: SongAnalysis[];
  /** v0.3부터 */
  licks?: Lick[];
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
  getAnalysis(songId: string): Promise<SongAnalysis | null>;
  saveAnalysis(analysis: SongAnalysis): Promise<void>;
  listLicks(): Promise<Lick[]>;
  getLick(id: string): Promise<Lick | null>;
  upsertLick(lick: Lick): Promise<void>;
  deleteLick(id: string): Promise<void>;
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
