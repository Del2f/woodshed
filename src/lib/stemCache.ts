import { clear, createStore, del, entries, get, keys, set } from 'idb-keyval';
import { stemUrl } from './engine';

/**
 * 분리된 기타 트랙을 브라우저(IndexedDB)에 통째로 저장해 두고 원곡처럼 재생한다.
 * 재생 중에는 엔진과 통신하지 않으므로 엔진을 꺼도 들을 수 있고, 재생·속도 변경이 엔진 응답에 묶이지 않는다.
 * 사이트 데이터를 지우면 사라지지만, 엔진 캐시(~/.woodshed/cache)에 원본이 남아 있어 다시 받으면 된다.
 */

const store = createStore('woodshed-stems', 'stems');
const keyOf = (fileHash: string, name: string) => `${fileHash}/${name}`;

export async function getCachedStem(fileHash: string, name: string): Promise<Blob | null> {
  return (await get<Blob>(keyOf(fileHash, name), store)) ?? null;
}

/** 엔진에서 받아 저장한다. 진행률(0~1)을 알려 준다. */
export async function downloadStem(fileHash: string, name: string, onProgress?: (p: number) => void, signal?: AbortSignal): Promise<Blob> {
  const r = await fetch(stemUrl(fileHash, name), { signal });
  if (!r.ok) throw new Error(r.status === 404 ? '엔진에 분리된 트랙이 없어요. 기타 분리를 켜고 다시 분석해 주세요.' : `분리 트랙을 받지 못했어요 (${r.status})`);
  const total = Number(r.headers.get('content-length')) || 0;
  let blob: Blob;
  if (r.body && total && onProgress) {
    const reader = r.body.getReader();
    const parts: Uint8Array[] = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      got += value.length;
      onProgress(got / total);
    }
    blob = new Blob(parts as BlobPart[], { type: r.headers.get('content-type') ?? 'audio/flac' });
  } else {
    blob = await r.blob();
  }
  await set(keyOf(fileHash, name), blob, store);
  globalThis.navigator?.storage?.persist?.().catch(() => undefined);
  return blob;
}

/** 같은 트랙을 동시에 두 번 받지 않도록 진행 중인 다운로드를 공유 */
const inflight = new Map<string, Promise<Blob>>();

/** 저장돼 있으면 그걸, 없으면 엔진에서 받아 저장 */
export async function loadStem(fileHash: string, name: string, onProgress?: (p: number) => void): Promise<Blob> {
  const cached = await getCachedStem(fileHash, name);
  if (cached) return cached;
  const k = keyOf(fileHash, name);
  let p = inflight.get(k);
  if (!p) {
    p = downloadStem(fileHash, name, onProgress).finally(() => inflight.delete(k));
    inflight.set(k, p);
  }
  return p;
}

export async function hasStems(fileHash: string, names: string[]): Promise<boolean> {
  const all = new Set(await keys(store));
  return names.every((n) => all.has(keyOf(fileHash, n)));
}

export async function deleteStems(fileHash: string): Promise<void> {
  for (const k of await keys(store)) {
    if (String(k).startsWith(`${fileHash}/`)) await del(k, store);
  }
}

export async function stemCacheUsage(): Promise<{ count: number; bytes: number }> {
  const all = await entries<string, Blob>(store);
  return { count: all.length, bytes: all.reduce((s, [, b]) => s + (b?.size ?? 0), 0) };
}

export async function clearStemCache(): Promise<void> {
  await clear(store);
}
