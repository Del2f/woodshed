import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { useStore } from '../lib/store/StoreProvider';
import { useAsync } from '../lib/useAsync';
import { useMusicFolder } from '../lib/useMusicFolder';
import { isBackupFile } from '../lib/store/types';
import { clearStemCache, stemCacheUsage } from '../lib/stemCache';

export function Settings() {
  const { store, supabase, session, localStore, version, bump } = useStore();
  const folder = useMusicFolder();
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const localQ = useAsync(() => localStore.exportAll(), [localStore, version]);
  const localCount = localQ.data ? localQ.data.songs.length : 0;
  const stemsQ = useAsync(() => stemCacheUsage(), []);
  const cloud = store.kind === 'supabase';

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setMsg(null);
    try {
      setMsg({ ok: true, text: await fn() });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const signIn = (e: FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    run(async () => {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin + window.location.pathname },
      });
      if (error) throw error;
      return `${email.trim()} 로 로그인 링크를 보냈어요. 같은 브라우저에서 메일의 링크를 열어 주세요.`;
    });
  };

  const migrate = () =>
    run(async () => {
      const backup = await localStore.exportAll();
      await store.importAll(backup);
      bump();
      return `${backup.songs.length}곡, 구간 ${backup.loops.length}개, 연습 기록 ${backup.sessions.length}개를 클라우드로 옮겼어요. 로컬 사본은 그대로 남겨 뒀어요.`;
    });

  const exportBackup = () =>
    run(async () => {
      const backup = await store.exportAll();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `woodshed-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      return `백업 파일을 내려받았어요 (${backup.songs.length}곡).`;
    });

  const importBackup = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    run(async () => {
      const data: unknown = JSON.parse(await f.text());
      if (!isBackupFile(data)) throw new Error('Woodshed 백업 파일이 아니에요.');
      await store.importAll(data);
      bump();
      return `${data.songs.length}곡, 구간 ${data.loops.length}개를 가져왔어요. 같은 항목은 덮어쓰고 중복은 만들지 않아요.`;
    });
  };

  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <header className="page-head">
        <div>
          <span className="eyebrow">설정</span>
          <h1 className="title-xl">저장과 백업</h1>
          <p className="lead">음원은 내 PC에, 연습 데이터는 클라우드에. 어느 쪽도 캐시를 지워서 사라지지 않게요.</p>
        </div>
      </header>

      {msg && (
        <div className={`banner${msg.ok ? '' : ' error'}`} role="status">
          <Icon name={msg.ok ? 'check' : 'alert'} />
          <span>{msg.text}</span>
        </div>
      )}

      <section className="card lg">
        <div className="card-head">
          <h2 className="title-s">연습 데이터 저장소</h2>
          <span className="status-line">
            <span className={`dot ${cloud ? 'green' : 'orange'}`} />
            {cloud ? 'Supabase 클라우드' : '이 브라우저 (로컬)'}
          </span>
        </div>

        {!supabase && (
          <p className="lead" style={{ fontSize: 14 }}>
            아직 Supabase가 연결되지 않았어요. 지금은 이 브라우저에만 저장되므로 사이트 데이터를 지우면 사라질 수 있어요. README의 ‘Supabase 연결’
            순서대로 <span className="mono">VITE_SUPABASE_URL</span>, <span className="mono">VITE_SUPABASE_ANON_KEY</span>를 설정하면 로그인 창이 나타나요.
          </p>
        )}

        {supabase && !session && (
          <form onSubmit={signIn} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p className="lead" style={{ fontSize: 14 }}>
              이메일로 로그인 링크를 받아 로그인하세요. 비밀번호는 없어요.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <label className="sr-only" htmlFor="email">이메일</label>
              <input id="email" className="input" type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} style={{ flex: '1 1 240px' }} />
              <button type="submit" className="btn primary" disabled={busy}>
                로그인 링크 받기
              </button>
            </div>
          </form>
        )}

        {session && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <span>
                <strong>{session.user.email}</strong> 로 로그인됨
              </span>
              <button type="button" className="btn sm" onClick={() => supabase?.auth.signOut()}>
                로그아웃
              </button>
            </div>
            {localCount > 0 && (
              <div className="banner">
                <Icon name="cloud" />
                <span>이 브라우저에 로그인 전에 저장한 곡이 {localCount}개 있어요. 클라우드로 옮겨 둘까요?</span>
                <button type="button" className="btn sm primary" disabled={busy} onClick={migrate}>
                  클라우드로 옮기기
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <section className="card lg">
        <div className="card-head">
          <h2 className="title-s">음원 폴더</h2>
          {folder.handle && <span className="muted" style={{ fontSize: 13 }}>{folder.handle.name}</span>}
        </div>
        {folder.status === 'unsupported' ? (
          <p className="lead" style={{ fontSize: 14 }}>이 브라우저는 폴더 연결을 지원하지 않아요. Chrome 또는 Edge를 권장해요.</p>
        ) : (
          <>
            <p className="lead" style={{ fontSize: 14 }}>
              음원 파일은 이 폴더에서 바로 읽고 어디에도 업로드하지 않아요. OneDrive·구글 드라이브 동기화 폴더를 쓰면 음원도 자동으로 백업돼요.
            </p>
            <div className="chips">
              <button type="button" className="btn light" onClick={folder.choose}>
                <Icon name="folder" size={18} />
                {folder.handle ? '다른 폴더 선택' : '폴더 선택'}
              </button>
              {(folder.status === 'prompt' || folder.status === 'denied') && (
                <button type="button" className="btn primary" onClick={folder.allow}>
                  접근 허용
                </button>
              )}
              {folder.handle && (
                <button type="button" className="btn danger" onClick={folder.forget}>
                  연결 해제
                </button>
              )}
            </div>
          </>
        )}
      </section>

      <section className="card lg">
        <h2 className="title-s">백업 파일</h2>
        <p className="lead" style={{ fontSize: 14 }}>
          곡 목록, 저장한 구간, 연습 기록을 JSON 파일 하나로 내려받거나 다시 불러와요. 클라우드와 별개로 가끔 한 번씩 받아 두면 가장 안전해요.
        </p>
        <div className="chips">
          <button type="button" className="btn" disabled={busy} onClick={exportBackup}>
            <Icon name="download" size={18} />
            백업 내려받기
          </button>
          <label className="btn" style={{ cursor: 'pointer' }}>
            <Icon name="upload" size={18} />
            백업 불러오기
            <input type="file" accept="application/json,.json" hidden onChange={importBackup} />
          </label>
        </div>
      </section>

      <section className="card lg">
        <div className="card-head">
          <h2 className="title-s">분리 트랙 저장 공간</h2>
          {stemsQ.data && (
            <span className="muted" style={{ fontSize: 13 }}>
              트랙 {stemsQ.data.count}개 · {(stemsQ.data.bytes / 1024 / 1024).toFixed(0)}MB
            </span>
          )}
        </div>
        <p className="lead" style={{ fontSize: 14 }}>
          기타만·기타 빼고 트랙은 이 브라우저에 저장해 두고 재생해요. 그래서 재생할 때는 분석 엔진이 필요 없어요. 비우면 다음에 고를 때 엔진에서 다시 받아요(엔진 쪽 원본은 그대로예요).
        </p>
        <button
          type="button"
          className="btn"
          style={{ alignSelf: 'flex-start' }}
          disabled={busy || !stemsQ.data?.count}
          onClick={() =>
            run(async () => {
              await clearStemCache();
              stemsQ.reload();
              return '저장해 둔 분리 트랙을 비웠어요.';
            })
          }
        >
          비우기
        </button>
      </section>

      <p className="muted" style={{ fontSize: 12, margin: 0 }}>Woodshed v{__APP_VERSION__}</p>
    </div>
  );
}
