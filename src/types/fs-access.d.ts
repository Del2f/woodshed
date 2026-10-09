// File System Access API 중 TypeScript 기본 lib에 아직 없는 부분 (Chrome/Edge 전용)

type FsPermissionMode = 'read' | 'readwrite';

interface FileSystemHandle {
  queryPermission(desc?: { mode?: FsPermissionMode }): Promise<PermissionState>;
  requestPermission(desc?: { mode?: FsPermissionMode }): Promise<PermissionState>;
}

interface FileSystemDirectoryHandle {
  values(): AsyncIterableIterator<FileSystemFileHandle | FileSystemDirectoryHandle>;
}

interface Window {
  showDirectoryPicker?(options?: { id?: string; mode?: FsPermissionMode; startIn?: string }): Promise<FileSystemDirectoryHandle>;
  showOpenFilePicker?(options?: {
    id?: string;
    multiple?: boolean;
    types?: { description?: string; accept: Record<string, `.${string}`[]> }[];
  }): Promise<FileSystemFileHandle[]>;
}
