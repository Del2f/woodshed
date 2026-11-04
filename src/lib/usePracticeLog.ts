import { useCallback, useEffect, useRef } from 'react';
import { useStore } from './store/StoreProvider';
import { uid } from './format';

/** 이보다 짧은 연습은 기록하지 않는다 (플레이어와 같은 기준) */
export const MIN_PRACTICE_SEC = 15;

/**
 * 곡이 없는 연습(커리큘럼 연습 카드 등)의 시간 기록. 재생할 때 start(), 멈출 때 pause().
 * 화면을 떠나거나 탭이 가려지면 쌓인 시간을 연습 기록으로 저장한다 — 홈 화면의 이번 주 연습 시간·연속 일수에 들어간다.
 */
export function usePracticeLog() {
  const { store, bump } = useStore();
  const storeRef = useRef(store);
  storeRef.current = store;
  const p = useRef({ startedAt: null as string | null, playStart: 0, accum: 0 });

  const pause = useCallback(() => {
    const s = p.current;
    if (s.playStart) s.accum += (performance.now() - s.playStart) / 1000;
    s.playStart = 0;
  }, []);

  const start = useCallback(() => {
    const s = p.current;
    if (s.playStart) return;
    s.playStart = performance.now();
    s.startedAt ??= new Date().toISOString();
  }, []);

  const flush = useCallback(async () => {
    const s = p.current;
    const playing = !!s.playStart;
    pause();
    if (s.accum < MIN_PRACTICE_SEC || !s.startedAt) {
      if (playing) start();
      return;
    }
    const session = { id: uid(), songId: null, startedAt: s.startedAt, durationSec: Math.round(s.accum) };
    s.accum = 0;
    s.startedAt = null;
    if (playing) start();
    try {
      await storeRef.current.addSession(session);
      bump();
    } catch (e) {
      console.error('연습 기록 저장 실패', e);
    }
  }, [pause, start, bump]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      pause();
      flush();
    };
  }, [flush, pause]);

  return { start, pause };
}
