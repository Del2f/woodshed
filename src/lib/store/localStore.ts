import { createStore, get, set, type UseStore } from 'idb-keyval';
import type { BackupFile, DataStore, LoopSection, PracticeSession, Song } from './types';

type Keyed = { id: string };

function upsertById<T extends Keyed>(rows: T[], row: T): T[] {
  const i = rows.findIndex((r) => r.id === row.id);
  if (i < 0) return [...rows, row];
  const next = rows.slice();
  next[i] = row;
  return next;
}

/**
 * Supabase에 로그인하기 전 쓰는 저장소. 이 브라우저의 IndexedDB에만 남으므로
 * 사이트 데이터를 지우면 사라진다 — 설정 화면에서 클라우드로 옮기도록 안내한다.
 */
export class LocalStore implements DataStore {
  readonly kind = 'local' as const;
  private db: UseStore;

  constructor(dbName = 'woodshed-local') {
    this.db = createStore(dbName, 'kv');
  }

  private async rows<T>(key: string): Promise<T[]> {
    return (await get<T[]>(key, this.db)) ?? [];
  }

  private async save<T>(key: string, rows: T[]): Promise<void> {
    await set(key, rows, this.db);
  }

  async listSongs(): Promise<Song[]> {
    const songs = await this.rows<Song>('songs');
    return songs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getSong(id: string): Promise<Song | null> {
    return (await this.rows<Song>('songs')).find((s) => s.id === id) ?? null;
  }

  async upsertSong(song: Song): Promise<void> {
    await this.save('songs', upsertById(await this.rows<Song>('songs'), song));
  }

  async deleteSong(id: string): Promise<void> {
    await this.save('songs', (await this.rows<Song>('songs')).filter((s) => s.id !== id));
    await this.save('loops', (await this.rows<LoopSection>('loops')).filter((l) => l.songId !== id));
    const sessions = await this.rows<PracticeSession>('sessions');
    await this.save('sessions', sessions.map((s) => (s.songId === id ? { ...s, songId: null } : s)));
  }

  async listLoops(songId: string): Promise<LoopSection[]> {
    const loops = await this.rows<LoopSection>('loops');
    return loops.filter((l) => l.songId === songId).sort((a, b) => a.start - b.start);
  }

  async upsertLoop(loop: LoopSection): Promise<void> {
    await this.save('loops', upsertById(await this.rows<LoopSection>('loops'), loop));
  }

  async deleteLoop(id: string): Promise<void> {
    await this.save('loops', (await this.rows<LoopSection>('loops')).filter((l) => l.id !== id));
  }

  async addSession(session: PracticeSession): Promise<void> {
    await this.save('sessions', upsertById(await this.rows<PracticeSession>('sessions'), session));
  }

  async listSessionsSince(iso: string): Promise<PracticeSession[]> {
    return (await this.rows<PracticeSession>('sessions')).filter((s) => s.startedAt >= iso);
  }

  async exportAll(): Promise<BackupFile> {
    return {
      app: 'woodshed',
      version: 1,
      exportedAt: new Date().toISOString(),
      songs: await this.rows<Song>('songs'),
      loops: await this.rows<LoopSection>('loops'),
      sessions: await this.rows<PracticeSession>('sessions'),
    };
  }

  async importAll(backup: BackupFile): Promise<void> {
    let songs = await this.rows<Song>('songs');
    let loops = await this.rows<LoopSection>('loops');
    let sessions = await this.rows<PracticeSession>('sessions');
    for (const s of backup.songs) songs = upsertById(songs, s);
    for (const l of backup.loops) loops = upsertById(loops, l);
    for (const s of backup.sessions) sessions = upsertById(sessions, s);
    await this.save('songs', songs);
    await this.save('loops', loops);
    await this.save('sessions', sessions);
  }
}
