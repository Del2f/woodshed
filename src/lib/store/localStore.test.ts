import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { LocalStore } from './localStore';
import { DEFAULT_TUNING, type Song } from './types';

const song = (id: string, createdAt: string): Song => ({
  id,
  title: `곡 ${id}`,
  artist: '',
  fileName: `${id}.mp3`,
  durationSec: null,
  bpm: null,
  musicalKey: null,
  tuning: DEFAULT_TUNING,
  createdAt,
  lastPracticedAt: null,
  lastLoopId: null,
});

describe('LocalStore', () => {
  it('곡 저장·수정·최신순 정렬', async () => {
    const st = new LocalStore('t1');
    await st.upsertSong(song('a', '2026-10-01T00:00:00Z'));
    await st.upsertSong(song('b', '2026-10-02T00:00:00Z'));
    await st.upsertSong({ ...song('a', '2026-10-01T00:00:00Z'), bpm: 120 });
    const list = await st.listSongs();
    expect(list.map((s) => s.id)).toEqual(['b', 'a']);
    expect(list[1].bpm).toBe(120);
  });

  it('곡을 지우면 구간도 지우고, 연습 기록은 남긴다', async () => {
    const st = new LocalStore('t2');
    await st.upsertSong(song('a', '2026-10-01T00:00:00Z'));
    await st.upsertLoop({ id: 'l1', songId: 'a', name: '솔로', start: 10, end: 20, speed: 0.8, createdAt: '2026-10-01T00:00:00Z' });
    await st.addSession({ id: 's1', songId: 'a', startedAt: '2026-10-03T00:00:00Z', durationSec: 600 });
    await st.deleteSong('a');
    expect(await st.listLoops('a')).toEqual([]);
    expect(await st.listSessionsSince('2026-10-01T00:00:00Z')).toEqual([
      { id: 's1', songId: null, startedAt: '2026-10-03T00:00:00Z', durationSec: 600 },
    ]);
  });

  it('백업 내보내기 → 다른 저장소로 가져오기', async () => {
    const a = new LocalStore('t3');
    await a.upsertSong(song('x', '2026-10-01T00:00:00Z'));
    await a.upsertLoop({ id: 'l', songId: 'x', name: '인트로', start: 0, end: 8, speed: 1, createdAt: '2026-10-01T00:00:00Z' });
    const backup = await a.exportAll();
    const b = new LocalStore('t4');
    await b.importAll(backup);
    await b.importAll(backup); // 두 번 가져와도 중복되지 않음
    expect((await b.listSongs()).length).toBe(1);
    expect((await b.listLoops('x'))[0].name).toBe('인트로');
  });
});

describe('LocalStore · 릭', () => {
  it('곡을 지워도 릭은 남고 곡 연결만 풀린다', async () => {
    const { newLick } = await import('../../features/licks/licks');
    const st = new LocalStore('t5');
    await st.upsertSong(song('s', '2026-10-01T00:00:00Z'));
    const lick = newLick({ title: '하강 런', songId: 's', source: { start: 10, end: 14, speed: 0.8 } });
    await st.upsertLick(lick);
    await st.deleteSong('s');
    const got = await st.getLick(lick.id);
    expect(got?.title).toBe('하강 런');
    expect(got?.songId).toBeNull();
    expect(got?.source).toBeNull();
  });

  it('백업에 릭이 들어가고 다시 가져와진다', async () => {
    const { newLick } = await import('../../features/licks/licks');
    const a = new LocalStore('t6');
    await a.upsertLick(newLick({ title: '갤럽' }));
    const backup = await a.exportAll();
    expect(backup.licks).toHaveLength(1);
    const b = new LocalStore('t7');
    await b.importAll(backup);
    expect((await b.listLicks())[0].title).toBe('갤럽');
  });
});
