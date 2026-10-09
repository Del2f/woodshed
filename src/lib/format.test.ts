import { describe, expect, it } from 'vitest';
import { formatDuration, formatTime, keyLabel, parseTitleFromFileName, practiceStreak, startOfWeek, weekBuckets } from './format';

describe('formatTime / formatDuration', () => {
  it('m:ss', () => {
    expect(formatTime(151.9)).toBe('2:31');
    expect(formatTime(NaN)).toBe('0:00');
  });
  it('시간·분', () => {
    expect(formatDuration(290 * 60)).toBe('4시간 50분');
    expect(formatDuration(35 * 60)).toBe('35분');
    expect(formatDuration(7200)).toBe('2시간');
  });
});

describe('parseTitleFromFileName', () => {
  it('"아티스트 - 제목" 분리', () => {
    expect(parseTitleFromFileName('Metal/Some Band - Great Song.mp3')).toEqual({ artist: 'Some Band', title: 'Great Song' });
  });
  it('하이픈 없으면 제목만', () => {
    expect(parseTitleFromFileName('solo_practice.wav')).toEqual({ artist: '', title: 'solo practice' });
  });
});

describe('keyLabel', () => {
  it('마이너/메이저', () => {
    expect(keyLabel('Em')).toBe('E 마이너');
    expect(keyLabel('G')).toBe('G 메이저');
    expect(keyLabel(null)).toBe('키 미정');
  });
});

describe('주간 통계', () => {
  const now = new Date(2026, 9, 11, 21, 0); // 2026-10-11 (일)
  it('주의 시작은 월요일', () => {
    expect(startOfWeek(now).getDate()).toBe(5);
  });
  it('요일별 합계', () => {
    const s = (d: number, h: number, sec: number) => ({ startedAt: new Date(2026, 9, d, h).toISOString(), durationSec: sec });
    const buckets = weekBuckets([s(5, 20, 600), s(5, 22, 300), s(11, 9, 1200), s(4, 20, 999)], now);
    expect(buckets).toEqual([900, 0, 0, 0, 0, 0, 1200]);
  });
  it('연속 일수: 오늘 안 했어도 어제까지 이어지면 센다', () => {
    const s = (d: number) => ({ startedAt: new Date(2026, 9, d, 20).toISOString() });
    expect(practiceStreak([s(8), s(9), s(10)], now)).toBe(3);
    expect(practiceStreak([s(8), s(10), s(11)], now)).toBe(2);
    expect(practiceStreak([s(5)], now)).toBe(0);
  });
});
