import type { SupabaseClient } from '@supabase/supabase-js';
import type { BackupFile, DataStore, LoopSection, PracticeSession, Song, SongAnalysis } from './types';

// DB는 snake_case, 앱은 camelCase. user_id는 DB 기본값(auth.uid())과 RLS가 처리한다.

interface SongRow {
  id: string;
  title: string;
  artist: string;
  file_name: string;
  duration_sec: number | null;
  bpm: number | null;
  musical_key: string | null;
  tuning: string;
  created_at: string;
  last_practiced_at: string | null;
  last_loop_id: string | null;
}

interface LoopRow {
  id: string;
  song_id: string;
  name: string;
  start_sec: number;
  end_sec: number;
  speed: number;
  created_at: string;
}

interface SessionRow {
  id: string;
  song_id: string | null;
  started_at: string;
  duration_sec: number;
}

const songToRow = (s: Song): SongRow => ({
  id: s.id,
  title: s.title,
  artist: s.artist,
  file_name: s.fileName,
  duration_sec: s.durationSec,
  bpm: s.bpm,
  musical_key: s.musicalKey,
  tuning: s.tuning,
  created_at: s.createdAt,
  last_practiced_at: s.lastPracticedAt,
  last_loop_id: s.lastLoopId,
});

const songFromRow = (r: SongRow): Song => ({
  id: r.id,
  title: r.title,
  artist: r.artist,
  fileName: r.file_name,
  durationSec: r.duration_sec,
  bpm: r.bpm,
  musicalKey: r.musical_key,
  tuning: r.tuning,
  createdAt: r.created_at,
  lastPracticedAt: r.last_practiced_at,
  lastLoopId: r.last_loop_id,
});

const loopToRow = (l: LoopSection): LoopRow => ({
  id: l.id,
  song_id: l.songId,
  name: l.name,
  start_sec: l.start,
  end_sec: l.end,
  speed: l.speed,
  created_at: l.createdAt,
});

const loopFromRow = (r: LoopRow): LoopSection => ({
  id: r.id,
  songId: r.song_id,
  name: r.name,
  start: r.start_sec,
  end: r.end_sec,
  speed: r.speed,
  createdAt: r.created_at,
});

const sessionToRow = (s: PracticeSession): SessionRow => ({
  id: s.id,
  song_id: s.songId,
  started_at: s.startedAt,
  duration_sec: Math.round(s.durationSec),
});

const sessionFromRow = (r: SessionRow): PracticeSession => ({
  id: r.id,
  songId: r.song_id,
  startedAt: r.started_at,
  durationSec: r.duration_sec,
});

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export class SupabaseStore implements DataStore {
  readonly kind = 'supabase' as const;

  constructor(private sb: SupabaseClient) {}

  async listSongs(): Promise<Song[]> {
    const rows = check<SongRow[]>(await this.sb.from('songs').select('*').order('created_at', { ascending: false }));
    return rows.map(songFromRow);
  }

  async getSong(id: string): Promise<Song | null> {
    const row = check<SongRow | null>(await this.sb.from('songs').select('*').eq('id', id).maybeSingle());
    return row ? songFromRow(row) : null;
  }

  async upsertSong(song: Song): Promise<void> {
    check(await this.sb.from('songs').upsert(songToRow(song)));
  }

  async deleteSong(id: string): Promise<void> {
    check(await this.sb.from('songs').delete().eq('id', id));
  }

  async listLoops(songId: string): Promise<LoopSection[]> {
    const rows = check<LoopRow[]>(await this.sb.from('loops').select('*').eq('song_id', songId).order('start_sec'));
    return rows.map(loopFromRow);
  }

  async upsertLoop(loop: LoopSection): Promise<void> {
    check(await this.sb.from('loops').upsert(loopToRow(loop)));
  }

  async deleteLoop(id: string): Promise<void> {
    check(await this.sb.from('loops').delete().eq('id', id));
  }

  async getAnalysis(songId: string): Promise<SongAnalysis | null> {
    const row = check<{ data: SongAnalysis } | null>(await this.sb.from('analyses').select('data').eq('song_id', songId).maybeSingle());
    return row ? row.data : null;
  }

  async saveAnalysis(analysis: SongAnalysis): Promise<void> {
    check(
      await this.sb.from('analyses').upsert({ song_id: analysis.songId, data: analysis, updated_at: new Date().toISOString() }),
    );
  }

  async addSession(session: PracticeSession): Promise<void> {
    check(await this.sb.from('practice_sessions').upsert(sessionToRow(session)));
  }

  async listSessionsSince(iso: string): Promise<PracticeSession[]> {
    const rows = check<SessionRow[]>(await this.sb.from('practice_sessions').select('*').gte('started_at', iso));
    return rows.map(sessionFromRow);
  }

  async exportAll(): Promise<BackupFile> {
    const songs = check<SongRow[]>(await this.sb.from('songs').select('*'));
    const loops = check<LoopRow[]>(await this.sb.from('loops').select('*'));
    const sessions = check<SessionRow[]>(await this.sb.from('practice_sessions').select('*'));
    const analyses = check<{ data: SongAnalysis }[]>(await this.sb.from('analyses').select('data'));
    return {
      app: 'woodshed',
      version: 1,
      exportedAt: new Date().toISOString(),
      songs: songs.map(songFromRow),
      loops: loops.map(loopFromRow),
      sessions: sessions.map(sessionFromRow),
      analyses: analyses.map((a) => a.data),
    };
  }

  async importAll(backup: BackupFile): Promise<void> {
    // 외래 키 순서: songs → loops → sessions
    if (backup.songs.length) check(await this.sb.from('songs').upsert(backup.songs.map(songToRow)));
    if (backup.loops.length) check(await this.sb.from('loops').upsert(backup.loops.map(loopToRow)));
    if (backup.sessions.length) check(await this.sb.from('practice_sessions').upsert(backup.sessions.map(sessionToRow)));
    const analyses = backup.analyses ?? [];
    if (analyses.length) {
      check(await this.sb.from('analyses').upsert(analyses.map((a) => ({ song_id: a.songId, data: a, updated_at: new Date().toISOString() }))));
    }
  }
}
