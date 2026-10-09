import { useCallback, useEffect, useState } from 'react';
import {
  folderStatus,
  folderSupported,
  forgetFolder,
  getSavedFolder,
  listAudioFiles,
  pickFolder,
  requestFolderAccess,
  type AudioEntry,
  type FolderStatus,
} from './audioFolder';

export function useMusicFolder() {
  const [handle, setHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [status, setStatus] = useState<FolderStatus>(folderSupported ? 'none' : 'unsupported');
  const [files, setFiles] = useState<AudioEntry[]>([]);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scan = useCallback(async (h: FileSystemDirectoryHandle) => {
    setScanning(true);
    setError(null);
    try {
      setFiles(await listAudioFiles(h));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    const h = await getSavedFolder();
    const st = await folderStatus(h);
    setHandle(h);
    setStatus(st);
    if (h && st === 'granted') await scan(h);
    else setFiles([]);
  }, [scan]);

  useEffect(() => {
    refresh().catch((e) => setError(String(e)));
  }, [refresh]);

  const choose = useCallback(async () => {
    const h = await pickFolder();
    if (!h) return;
    setHandle(h);
    setStatus('granted');
    await scan(h);
  }, [scan]);

  const allow = useCallback(async () => {
    if (!handle) return;
    if (await requestFolderAccess(handle)) {
      setStatus('granted');
      await scan(handle);
    } else {
      setStatus('denied');
    }
  }, [handle, scan]);

  const forget = useCallback(async () => {
    await forgetFolder();
    setHandle(null);
    setStatus(folderSupported ? 'none' : 'unsupported');
    setFiles([]);
  }, []);

  return { handle, status, files, scanning, error, choose, allow, refresh, forget };
}
