import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearStemCache, deleteStems, getCachedStem, hasStems, loadStem, stemCacheUsage } from './stemCache';

const HASH = 'a'.repeat(40);

function mockEngine(bytes = 1000) {
  const fn = vi.fn(async () => new Response(new Uint8Array(bytes), { status: 200, headers: { 'content-type': 'audio/flac', 'content-length': String(bytes) } }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await clearStemCache();
});

describe('stemCache', () => {
  it('처음 한 번만 엔진에서 받고, 그다음부터는 저장된 것을 쓴다', async () => {
    const fetch = mockEngine(2048);
    const progress: number[] = [];
    const a = await loadStem(HASH, 'guitar', (p) => progress.push(p));
    const b = await loadStem(HASH, 'guitar');
    expect(a.size).toBe(2048);
    expect(b.size).toBe(2048);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(progress.at(-1)).toBe(1);
  });

  it('동시에 같은 트랙을 요청해도 한 번만 받는다', async () => {
    const fetch = mockEngine();
    await Promise.all([loadStem(HASH, 'no_guitar'), loadStem(HASH, 'no_guitar'), loadStem(HASH, 'no_guitar')]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('엔진이 꺼져 있고 저장된 것도 없으면 실패한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    await expect(loadStem(HASH, 'guitar')).rejects.toBeInstanceOf(TypeError);
  });

  it('엔진이 꺼져 있어도 저장된 트랙은 재생할 수 있다', async () => {
    mockEngine();
    await loadStem(HASH, 'guitar');
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    expect((await loadStem(HASH, 'guitar')).size).toBe(1000);
  });

  it('곡을 지우면 그 곡의 트랙만 지운다', async () => {
    mockEngine();
    await loadStem(HASH, 'guitar');
    await loadStem(HASH, 'no_guitar');
    await loadStem('b'.repeat(40), 'guitar');
    expect(await hasStems(HASH, ['guitar', 'no_guitar'])).toBe(true);
    await deleteStems(HASH);
    expect(await getCachedStem(HASH, 'guitar')).toBeNull();
    expect((await stemCacheUsage()).count).toBe(1);
  });
});
