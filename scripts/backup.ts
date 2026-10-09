/**
 * Supabase 전체를 앱의 백업 파일(JSON)로 내려받는다. 설정 → 백업 불러오기로 그대로 복원된다.
 * 비공개 백업 저장소의 GitHub Actions가 매주 실행한다.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx vite-node scripts/backup.ts -- 저장할파일.json
 *
 * service_role 키는 RLS를 건너뛰는 관리자 키다. 브라우저·공개 저장소에는 절대 넣지 말 것.
 */
import { writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { SupabaseStore } from '../src/lib/store/supabaseStore';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const out = process.argv.slice(2).filter((a) => a !== '--')[0];
if (!url || !key || !out) {
  console.error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 환경 변수와 저장할 파일 경로가 필요합니다.');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const backup = await new SupabaseStore(sb).exportAll();
writeFileSync(out, JSON.stringify(backup, null, 2) + '\n');
console.log(
  `곡 ${backup.songs.length} · 구간 ${backup.loops.length} · 연습 기록 ${backup.sessions.length} · 분석 ${backup.analyses?.length ?? 0} · 릭 ${backup.licks?.length ?? 0} → ${out}`,
);
