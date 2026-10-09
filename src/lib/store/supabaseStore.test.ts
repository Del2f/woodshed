import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseStore } from './supabaseStore';

/** select → order → range 만 흉내 내는 가짜 클라이언트. 표마다 행 수를 정한다 */
function fakeClient(counts: Record<string, number>) {
  const calls: string[] = [];
  const sb = {
    from(table: string) {
      return {
        select: () => ({
          order: () => ({
            range: async (from: number, to: number) => {
              calls.push(`${table} ${from}-${to}`);
              const n = counts[table] ?? 0;
              const rows = Array.from({ length: Math.max(0, Math.min(n, to + 1) - from) }, (_, i) => fakeRow(table, from + i));
              return { data: rows, error: null };
            },
          }),
        }),
      };
    },
  };
  return { sb: sb as unknown as SupabaseClient, calls };
}

function fakeRow(table: string, i: number) {
  const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
  if (table === 'practice_sessions') return { id, song_id: null, started_at: '2026-01-01T00:00:00Z', duration_sec: 60 };
  return { id };
}

describe('SupabaseStore.exportAll', () => {
  it('1000행이 넘는 표도 나눠서 전부 받는다', async () => {
    const { sb, calls } = fakeClient({ practice_sessions: 2345 });
    const backup = await new SupabaseStore(sb).exportAll();
    expect(backup.sessions).toHaveLength(2345);
    expect(new Set(backup.sessions.map((s) => s.id)).size).toBe(2345);
    expect(calls.filter((c) => c.startsWith('practice_sessions'))).toEqual([
      'practice_sessions 0-999',
      'practice_sessions 1000-1999',
      'practice_sessions 2000-2999',
    ]);
  });

  it('딱 1000행이면 빈 페이지를 한 번 더 확인하고 끝낸다', async () => {
    const { sb, calls } = fakeClient({ practice_sessions: 1000 });
    const backup = await new SupabaseStore(sb).exportAll();
    expect(backup.sessions).toHaveLength(1000);
    expect(calls.filter((c) => c.startsWith('practice_sessions'))).toHaveLength(2);
  });
});
