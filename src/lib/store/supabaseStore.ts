import type { SupabaseClient } from '@supabase/supabase-js';
import type { BackupFile, DataStore, Lick, LoopSection, PracticeSession, Song, SongAnalysis } from './types';

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

// 릭은 내용 전체를 jsonb 하나에 담고, 곡 연결(지우면 null)과 복습일만 열로 둔다
interface LickRow {
  id: string;
  song_id: string | null;
  due_at: string;
  data: Lick;
  updated_at: string;
}

const lickToRow = (l: Lick): LickRow => ({ id: l.id, song_id: l.songId, due_at: l.srs.dueAt, data: l, updated_at: l.updatedAt });
// 곡을 지우면 DB가 song_id를 비우므로 그 값을 따른다
const lickFromRow = (r: LickRow): Lick => ({ ...r.data, songId: r.song_id, source: r.song_id ? r.data.source : null });

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export class SupabaseStore implements DataStore {
  readonly kind = 'supabase' as const;

  constructor(private sb: SupabaseClient) {}

  /** 표 전체 — Supabase는 한 번에 최대 1000행만 돌려주므로 나눠서 받는다 */
  private async selectAll<T>(table: string, columns: string, orderBy: string): Promise<T[]> {
    const PAGE = 1000;
    const out: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const res = await this.sb.from(table).select(columns).order(orderBy).range(from, from + PAGE - 1);
      const rows = check(res) as unknown as T[];
      out.push(...rows);
      if (rows.length < PAGE) return out;
    }
  }

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

  async listLicks(): Promise<Lick[]> {
    const rows = check<LickRow[]>(await this.sb.from('licks').select('*').order('updated_at', { ascending: false }));
    return rows.map(lickFromRow);
  }

  async getLick(id: string): Promise<Lick | null> {
    const row = check<LickRow | null>(await this.sb.from('licks').select('*').eq('id', id).maybeSingle());
    return row ? lickFromRow(row) : null;
  }

  async upsertLick(lick: Lick): Promise<void> {
    check(await this.sb.from('licks').upsert(lickToRow(lick)));
  }

  async deleteLick(id: string): Promise<void> {
    check(await this.sb.from('licks').delete().eq('id', id));
  }

  async addSession(session: PracticeSession): Promise<void> {
    check(await this.sb.from('practice_sessions').upsert(sessionToRow(session)));
  }

  async listSessionsSince(iso: string): Promise<PracticeSession[]> {
    const rows = check<SessionRow[]>(await this.sb.from('practice_sessions').select('*').gte('started_at', iso));
    return rows.map(sessionFromRow);
  }

  async exportAll(): Promise<BackupFile> {
    const songs = await this.selectAll<SongRow>('songs', '*', 'id');
    const loops = await this.selectAll<LoopRow>('loops', '*', 'id');
    const sessions = await this.selectAll<SessionRow>('practice_sessions', '*', 'id');
    const analyses = await this.selectAll<{ data: SongAnalysis }>('analyses', 'data', 'song_id');
    const licks = await this.selectAll<LickRow>('licks', '*', 'id');
    return {
      app: 'woodshed',
      version: 1,
      exportedAt: new Date().toISOString(),
      songs: songs.map(songFromRow),
      loops: loops.map(loopFromRow),
      sessions: sessions.map(sessionFromRow),
      analyses: analyses.map((a) => a.data),
      licks: licks.map(lickFromRow),
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
    const licks = backup.licks ?? [];
    if (licks.length) check(await this.sb.from('licks').upsert(licks.map(lickToRow)));
  }
}
