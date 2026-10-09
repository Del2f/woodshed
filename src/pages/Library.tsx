import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { useStore } from '../lib/store/StoreProvider';
import { useAsync } from '../lib/useAsync';
import { useMusicFolder } from '../lib/useMusicFolder';
import { displayFileName, filePickerSupported, pickAudioFiles, rememberSessionFile } from '../lib/audioFolder';
import { formatDuration, formatTime, keyLabel, practiceStreak, weekBuckets } from '../lib/format';
import { newSong, relativeDay, tileColor } from '../lib/songs';
import type { Lick, Song } from '../lib/store/types';
import { dueLicks } from '../features/licks/licks';
import { dueLabel } from '../features/licks/srs';

const DAYS = ['월', '화', '수', '목', '금', '토', '일'];

export function Library() {
  const { store, version, bump } = useStore();
  const songsQ = useAsync(() => store.listSongs(), [store, version]);
  const since = useMemo(() => new Date(Date.now() - 60 * 86_400_000).toISOString(), []);
  const sessionsQ = useAsync(() => store.listSessionsSince(since), [store, version, since]);
  const licksQ = useAsync(() => store.listLicks(), [store, version]);
  const folder = useMusicFolder();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const songs = songsQ.data ?? [];
  const known = useMemo(() => new Set(songs.map((s) => s.fileName)), [songs]);
  const newFiles = folder.files.filter((f) => !known.has(f.path));

  /** 곡을 추가하고, 한 곡이면 바로 플레이어로 */
  const addSongs = async (paths: string[], openIfSingle = false) => {
    if (!paths.length) return;
    setBusy(true);
    try {
      const added = paths.map(newSong);
      for (const s of added) await store.upsertSong(s);
      bump();
      if (openIfSingle && added.length === 1) navigate(`/player/${added[0].id}`);
    } finally {
      setBusy(false);
    }
  };

  // 폴더와 상관없이 어디 있는 파일이든 하나씩(또는 여러 개) 추가
  const addFromFiles = async () => {
    if (!filePickerSupported) {
      fileInput.current?.click();
      return;
    }
    try {
      await addSongs(await pickAudioFiles(), true);
    } catch (e) {
      alert(`파일을 추가하지 못했어요: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const onPickFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach(rememberSessionFile);
    await addSongs(
      files.map((f) => f.name).filter((n) => !known.has(n)),
      true,
    );
    e.target.value = '';
  };

  const recent = songs
    .filter((s) => s.lastPracticedAt)
    .sort((a, b) => (b.lastPracticedAt ?? '').localeCompare(a.lastPracticedAt ?? ''))[0];

  const now = new Date();
  const sessions = sessionsQ.data ?? [];
  const week = weekBuckets(sessions, now);
  const weekTotal = week.reduce((a, b) => a + b, 0);
  const maxDay = Math.max(...week, 1);
  const todayIdx = (now.getDay() + 6) % 7;
  const streak = practiceStreak(sessions, now);

  const q = query.trim().toLowerCase();
  const visible = q ? songs.filter((s) => `${s.title} ${s.artist}`.toLowerCase().includes(q)) : songs;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <span className="eyebrow">라이브러리</span>
          <h1 className="title-xl">오늘은 어떤 곡을 연습할까요?</h1>
        </div>
        <div className="chips" style={{ alignItems: 'center', gap: 12 }}>
          <label className="search">
            <Icon name="search" size={18} strokeWidth={2} />
            <span className="sr-only">곡 검색</span>
            <input type="search" placeholder="곡, 아티스트 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          {folder.status !== 'unsupported' && (
            <button type="button" className="btn" onClick={folder.status === 'granted' ? folder.refresh : folder.choose}>
              <Icon name={folder.status === 'granted' ? 'repeat' : 'folder'} size={18} strokeWidth={2} />
              {folder.status === 'granted' ? '폴더 다시 읽기' : '폴더 연결'}
            </button>
          )}
          <button type="button" className="btn primary" onClick={addFromFiles} disabled={busy}>
            <Icon name="plus" size={18} strokeWidth={2.2} />곡 추가
          </button>
          <input ref={fileInput} type="file" accept="audio/*" multiple hidden onChange={onPickFiles} />
        </div>
      </header>

      {songsQ.error && (
        <div className="banner error">
          <Icon name="alert" />
          <span>데이터를 불러오지 못했어요: {songsQ.error.message}</span>
          <button type="button" className="btn sm" onClick={songsQ.reload}>
            다시 시도
          </button>
        </div>
      )}

      {recent ? (
        <section className="card lg hero" aria-label="이어서 연습">
          <div className="hero-info">
            <span className="eyebrow" style={{ fontSize: 13, letterSpacing: '0.04em' }}>
              이어서 연습
            </span>
            <h2 className="title-l" style={{ fontSize: 30 }}>
              {recent.title}
            </h2>
            <p className="lead" style={{ fontSize: 15 }}>
              {recent.artist ? `${recent.artist} · ` : ''}마지막 연습 {relativeDay(recent.lastPracticedAt!)}
            </p>
            <SongChips song={recent} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Link to={`/player/${recent.id}`} className="play-btn accent md" aria-label={`${recent.title} 이어서 연습`}>
              <Icon name="play" size={24} />
            </Link>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontWeight: 600 }}>마지막 구간부터</span>
              <span className="muted" style={{ fontSize: 14 }}>
                속도·반복 구간이 그대로 남아 있어요
              </span>
            </div>
          </div>
        </section>
      ) : null}

      <div className="grid-auto">
        <FolderCard folder={folder} newFiles={newFiles.map((f) => f.path)} busy={busy} onAdd={addSongs} onPickFiles={() => fileInput.current?.click()} />

        <section className="card" aria-label="이번 주 연습">
          <h3 className="title-s">이번 주 연습</h3>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span className="big-number">{formatDuration(weekTotal)}</span>
            {streak > 0 && <span className="muted" style={{ fontSize: 13 }}>{streak}일 연속</span>}
          </div>
          <div className="week" style={{ marginTop: 'auto' }}>
            {week.map((sec, i) => (
              <div key={DAYS[i]} title={`${DAYS[i]}요일 ${formatDuration(sec)}`}>
                <span
                  className={`bar${sec === 0 ? ' empty' : ''}${i === todayIdx ? ' today' : ''}`}
                  style={{ height: Math.max(4, Math.round((sec / maxDay) * 80)) }}
                />
                <span className={`d${i === todayIdx ? ' today' : ''}`}>{DAYS[i]}</span>
              </div>
            ))}
          </div>
        </section>

        <ReviewCard licks={licksQ.data ?? null} />
      </div>

      <section aria-label="내 라이브러리" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="card-head">
          <h2 className="title-m">내 라이브러리</h2>
          <span className="muted" style={{ fontSize: 14 }}>
            {songs.length}곡
          </span>
        </div>
        {songsQ.loading && !songsQ.data ? (
          <p className="muted">불러오는 중…</p>
        ) : visible.length === 0 ? (
          <div className="empty">
            <Icon name="library" size={32} />
            <strong style={{ fontSize: 18 }}>{q ? '검색 결과가 없어요' : '아직 곡이 없어요'}</strong>
            {!q && <span className="muted">‘곡 추가’로 음원을 하나씩 넣거나, 음원 폴더를 연결해 보세요.</span>}
          </div>
        ) : (
          <div className="song-grid">
            {visible.map((s) => (
              <SongCard key={s.id} song={s} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SongChips({ song }: { song: Song }) {
  return (
    <div className="chips">
      <span className="chip">{keyLabel(song.musicalKey)}</span>
      {song.bpm ? <span className="chip">{song.bpm} BPM</span> : null}
      <span className="chip">{song.tuning}</span>
    </div>
  );
}

function SongCard({ song }: { song: Song }) {
  const c = tileColor(song.id);
  return (
    <Link to={`/player/${song.id}`} className="song-card">
      <div className="song-tile" style={{ background: c.bg, color: c.fg }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{song.tuning}</span>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span className="k">{song.musicalKey ?? '—'}</span>
          <span className="mono" style={{ fontSize: 14, fontWeight: 600 }}>
            {song.bpm ?? ''}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="song-title">{song.title}</span>
        <span className="song-meta">
          {[song.artist, song.durationSec ? formatTime(song.durationSec) : null].filter(Boolean).join(' · ') || displayFileName(song.fileName)}
        </span>
      </div>
    </Link>
  );
}

function FolderCard({
  folder,
  newFiles,
  busy,
  onAdd,
  onPickFiles,
}: {
  folder: ReturnType<typeof useMusicFolder>;
  newFiles: string[];
  busy: boolean;
  onAdd: (paths: string[]) => void;
  onPickFiles: () => void;
}) {
  return (
    <section className="card" aria-label="음원 폴더">
      <div className="card-head">
        <h3 className="title-s">음원 폴더</h3>
        {folder.status === 'granted' && folder.handle && (
          <span className="muted" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="folder" size={14} />
            {folder.handle.name} · {folder.files.length}곡
          </span>
        )}
      </div>

      {folder.status === 'unsupported' && (
        <>
          <p className="lead" style={{ fontSize: 14 }}>
            이 브라우저는 폴더 연결을 지원하지 않아요. Chrome이나 Edge에서는 폴더를 한 번 연결해 두면 계속 쓸 수 있어요. 여기서는 연습할 때마다
            파일을 골라 주세요.
          </p>
          <button type="button" className="btn light" style={{ alignSelf: 'flex-start' }} onClick={onPickFiles}>
            파일 고르기
          </button>
        </>
      )}

      {folder.status === 'none' && (
        <>
          <p className="lead" style={{ fontSize: 14 }}>
            음원은 업로드하지 않고 PC에서 바로 읽어요. 폴더를 연결하면 그 안의 곡을 한 번에 볼 수 있고, 폴더 없이 ‘곡 추가’로 하나씩 넣어도 돼요.
          </p>
          <button type="button" className="btn light" style={{ alignSelf: 'flex-start' }} onClick={folder.choose}>
            <Icon name="folder" size={18} />
            폴더 선택
          </button>
        </>
      )}

      {(folder.status === 'prompt' || folder.status === 'denied') && (
        <>
          <p className="lead" style={{ fontSize: 14 }}>
            브라우저 보안 때문에 방문할 때마다 폴더 읽기를 한 번 허용해야 해요.
          </p>
          <div className="chips">
            <button type="button" className="btn primary" onClick={folder.allow}>
              “{folder.handle?.name}” 폴더 허용
            </button>
            <button type="button" className="btn" onClick={folder.choose}>
              다른 폴더
            </button>
          </div>
        </>
      )}

      {folder.status === 'granted' && (
        <>
          {folder.scanning ? (
            <p className="muted">폴더를 읽는 중…</p>
          ) : newFiles.length === 0 ? (
            <p className="lead" style={{ fontSize: 14 }}>
              폴더의 음원이 모두 라이브러리에 있어요. 폴더에 새 파일을 넣고 ‘폴더 다시 읽기’를 누르세요.
            </p>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <span style={{ fontWeight: 600, color: 'var(--accent-text)' }}>새로 발견한 음원 {newFiles.length}개</span>
                <button type="button" className="btn sm primary" disabled={busy} onClick={() => onAdd(newFiles)}>
                  모두 추가
                </button>
              </div>
              <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                {newFiles.slice(0, 50).map((p) => (
                  <div key={p} className="file-row">
                    <span className="name" title={p}>
                      {p}
                    </span>
                    <button type="button" className="btn sm" disabled={busy} onClick={() => onAdd([p])}>
                      추가
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {folder.error && <p style={{ color: 'var(--red)', margin: 0, fontSize: 13 }}>{folder.error}</p>}
    </section>
  );
}

/** 오늘 복습할 릭 — 잊을 때쯤 다시 꺼내 주는 곳 */
function ReviewCard({ licks }: { licks: Lick[] | null }) {
  if (!licks) return null;
  const due = dueLicks(licks);
  const next = [...licks].sort((a, b) => a.srs.dueAt.localeCompare(b.srs.dueAt))[0];
  return (
    <section className={`card${due.length ? ' accent' : ''}`} aria-label="오늘의 복습 릭">
      <div className="card-head">
        <h3 className="title-s">오늘의 복습 릭</h3>
        <Link to="/licks" style={{ fontSize: 14 }}>보관함</Link>
      </div>
      {licks.length === 0 ? (
        <>
          <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
            카피한 릭을 타브로 적어 두면, 잊을 때쯤 여기서 다시 꺼내 드려요.
          </p>
          <Link to="/licks" className="btn sm light" style={{ alignSelf: 'flex-start', marginTop: 'auto' }}>첫 릭 적기</Link>
        </>
      ) : due.length === 0 ? (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span className="big-number">0</span>
            <span className="muted" style={{ fontSize: 13 }}>오늘은 다 했어요</span>
          </div>
          <span className="muted" style={{ fontSize: 14, marginTop: 'auto' }}>다음 복습: {next.title} · {dueLabel(next.srs)}</span>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span className="big-number">{due.length}</span>
            <span className="muted" style={{ fontSize: 13 }}>개 기다리는 중</span>
          </div>
          <span className="muted" style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {due.slice(0, 3).map((l) => l.title).join(' · ')}
            {due.length > 3 ? ` 외 ${due.length - 3}개` : ''}
          </span>
          <Link to="/licks/review" className="btn sm primary" style={{ alignSelf: 'flex-start', marginTop: 'auto' }}>복습 시작</Link>
        </>
      )}
    </section>
  );
}
