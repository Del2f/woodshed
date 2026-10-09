import { createStore, del, get, set } from 'idb-keyval';
import { isAudioFile } from './format';

/**
 * 음원은 서버에 올리지 않고 PC의 '음원 폴더'에서 바로 읽는다.
 * 폴더 핸들은 IndexedDB에 보관되므로 다음 방문 때 권한 확인 한 번이면 다시 열린다.
 * (File System Access API를 지원하지 않는 브라우저는 파일을 직접 고르는 방식으로 대체)
 */

const handleStore = createStore('woodshed-handles', 'handles');
const HANDLE_KEY = 'music-folder';

export interface AudioEntry {
  /** 폴더 기준 상대 경로 */
  path: string;
  handle: FileSystemFileHandle;
}

export type FolderStatus = 'unsupported' | 'none' | 'prompt' | 'granted' | 'denied';

export const folderSupported = typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';

/** 폴더를 쓸 수 없는 브라우저에서 이번 세션 동안 고른 파일 */
const sessionFiles = new Map<string, File>();

export function rememberSessionFile(file: File): void {
  sessionFiles.set(file.name, file);
}

export async function getSavedFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!folderSupported) return null;
  return (await get<FileSystemDirectoryHandle>(HANDLE_KEY, handleStore)) ?? null;
}

export async function pickFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!window.showDirectoryPicker) return null;
  try {
    const handle = await window.showDirectoryPicker({ id: 'woodshed-music', mode: 'read' });
    await set(HANDLE_KEY, handle, handleStore);
    return handle;
  } catch (e) {
    if ((e as DOMException).name === 'AbortError') return null;
    throw e;
  }
}

export async function forgetFolder(): Promise<void> {
  await del(HANDLE_KEY, handleStore);
}

export async function folderStatus(handle: FileSystemDirectoryHandle | null): Promise<FolderStatus> {
  if (!folderSupported) return 'unsupported';
  if (!handle) return 'none';
  return (await handle.queryPermission({ mode: 'read' })) as FolderStatus;
}

/** 사용자 클릭 안에서 호출해야 한다 */
export async function requestFolderAccess(handle: FileSystemDirectoryHandle): Promise<boolean> {
  return (await handle.requestPermission({ mode: 'read' })) === 'granted';
}

/** 폴더 안 음원 목록 (하위 폴더 maxDepth 단계까지) */
export async function listAudioFiles(dir: FileSystemDirectoryHandle, maxDepth = 2, prefix = ''): Promise<AudioEntry[]> {
  const out: AudioEntry[] = [];
  for await (const entry of dir.values()) {
    if (entry.kind === 'file' && isAudioFile(entry.name)) {
      out.push({ path: prefix + entry.name, handle: entry as FileSystemFileHandle });
    } else if (entry.kind === 'directory' && maxDepth > 0 && !entry.name.startsWith('.')) {
      out.push(...(await listAudioFiles(entry as FileSystemDirectoryHandle, maxDepth - 1, `${prefix}${entry.name}/`)));
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path, 'ko'));
}

export type ResolveResult =
  | { status: 'ok'; file: File }
  | { status: 'need-permission'; handle: FileSystemDirectoryHandle }
  | { status: 'missing' };

/** 곡의 상대 경로로 실제 파일을 찾는다 */
export async function resolveSongFile(path: string): Promise<ResolveResult> {
  const cached = sessionFiles.get(path) ?? sessionFiles.get(path.split('/').pop() ?? path);
  if (cached) return { status: 'ok', file: cached };

  const root = await getSavedFolder();
  if (!root) return { status: 'missing' };
  const perm = await root.queryPermission({ mode: 'read' });
  if (perm !== 'granted') return { status: 'need-permission', handle: root };

  try {
    const parts = path.split('/');
    let dir = root;
    for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p);
    const fh = await dir.getFileHandle(parts[parts.length - 1]);
    return { status: 'ok', file: await fh.getFile() };
  } catch {
    return { status: 'missing' };
  }
}
