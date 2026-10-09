import { useCallback, useEffect, useState } from 'react';
import type { SongAnalysis } from './store/types';

/**
 * 내 PC에서 돌아가는 분석 엔진(engine/)과 통신한다.
 * 음원은 이 PC의 127.0.0.1 로만 전송되고 인터넷으로 나가지 않는다.
 */

const URL_KEY = 'woodshed.engineUrl';
export const DEFAULT_ENGINE_URL = 'http://127.0.0.1:8765';

export function engineUrl(): string {
  try {
    return localStorage.getItem(URL_KEY) || DEFAULT_ENGINE_URL;
  } catch {
    return DEFAULT_ENGINE_URL;
  }
}

export function setEngineUrl(url: string): void {
  try {
    if (!url || url === DEFAULT_ENGINE_URL) localStorage.removeItem(URL_KEY);
    else localStorage.setItem(URL_KEY, url.replace(/\/+$/, ''));
  } catch {
    /* 무시 */
  }
}

export interface EngineHealth {
  ok: boolean;
  version: string;
  analysisVersion: number;
  features: { separation: boolean; gpu: string | null };
}

export async function checkEngine(timeoutMs = 2000): Promise<EngineHealth | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${engineUrl()}/health`, { signal: ctrl.signal });
    return r.ok ? ((await r.json()) as EngineHealth) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 엔진 상태를 주기적으로 확인 */
export function useEngine(pollMs = 8000) {
  const [health, setHealth] = useState<EngineHealth | null>(null);
  const [checked, setChecked] = useState(false);

  const refresh = useCallback(async () => {
    setHealth(await checkEngine());
    setChecked(true);
  }, []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, pollMs);
    return () => window.clearInterval(id);
  }, [refresh, pollMs]);

  return { health, online: !!health, checked, refresh };
}

type EngineResult = Omit<SongAnalysis, 'songId'>;

interface JobStatus {
  id: string;
  status: 'queued' | 'running' | 'done' | 'error';
  step: string;
  progress: number;
  result: EngineResult | null;
  error: string | null;
}

async function readError(r: Response): Promise<string> {
  try {
    const body = await r.json();
    return typeof body.detail === 'string' ? body.detail : `엔진 오류 (${r.status})`;
  } catch {
    return `엔진 오류 (${r.status})`;
  }
}

export async function analyzeWithEngine(
  file: File,
  opts: { separate: boolean },
  onProgress: (step: string, progress: number) => void,
  signal?: AbortSignal,
): Promise<EngineResult> {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('separate', opts.separate ? 'true' : 'false');
  onProgress('엔진으로 보내는 중', 0.02);

  let r: Response;
  try {
    r = await fetch(`${engineUrl()}/analyze`, { method: 'POST', body: form, signal });
  } catch {
    throw new Error('분석 엔진에 연결하지 못했어요. 엔진이 켜져 있는지, 브라우저가 로컬 네트워크 접근을 허용했는지 확인해 주세요.');
  }
  if (!r.ok) throw new Error(await readError(r));
  let job = (await r.json()) as JobStatus;

  while (job.status === 'queued' || job.status === 'running') {
    onProgress(job.step, job.progress);
    await new Promise((res) => setTimeout(res, 700));
    if (signal?.aborted) throw new DOMException('취소됨', 'AbortError');
    const p = await fetch(`${engineUrl()}/jobs/${job.id}`, { signal });
    if (!p.ok) throw new Error(await readError(p));
    job = (await p.json()) as JobStatus;
  }
  if (job.status === 'error' || !job.result) throw new Error(job.error ?? '분석에 실패했어요');
  onProgress('완료', 1);
  return job.result;
}

export function stemUrl(fileHash: string, name: string): string {
  return `${engineUrl()}/stems/${fileHash}/${name}`;
}
