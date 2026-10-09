import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Segmented } from '../components/controls';
import { useStore } from '../lib/store/StoreProvider';
import { useAsync } from '../lib/useAsync';
import type { Lick, Song } from '../lib/store/types';
import { TabStaff } from '../features/tab/TabStaff';
import { allTags, bestBpm, dueLicks, newLick } from '../features/licks/licks';
import { dueLabel, isDue } from '../features/licks/srs';

type Sort = 'due' | 'recent' | 'title';

export function Licks() {
  const { store, version, bump } = useStore();
  const navigate = useNavigate();
  const licksQ = useAsync(() => store.listLicks(), [store, version]);
  const songsQ = useAsync(() => store.listSongs(), [store, version]);
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [favOnly, setFavOnly] = useState(false);
  const [sort, setSort] = useState<Sort>('due');

  const licks = licksQ.data ?? [];
  const songs = useMemo(() => new Map((songsQ.data ?? []).map((s) => [s.id, s])), [songsQ.data]);
  const tags = allTags(licks);
  const due = dueLicks(licks);

  const q = query.trim().toLowerCase();
  const visible = licks
    .filter((l) => (!tag || l.tags.includes(tag)) && (!favOnly || l.favorite))
    .filter((l) => !q || `${l.title} ${l.tags.join(' ')} ${l.memo} ${songs.get(l.songId ?? '')?.title ?? ''}`.toLowerCase().includes(q))
    .sort((a, b) => (sort === 'due' ? a.srs.dueAt.localeCompare(b.srs.dueAt) : sort === 'recent' ? b.updatedAt.localeCompare(a.updatedAt) : a.title.localeCompare(b.title, 'ko')));

  const create = async () => {
    const l = newLick({});
    await store.upsertLick(l);
    bump();
    navigate(`/tabs/${l.id}`);
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <span className="eyebrow">릭 보관함</span>
          <h1 className="title-xl">카피한 건, 잊지 않게.</h1>
          <p className="lead">곡에서 딴 릭과 직접 적은 릭을 모아 두고, 잊을 때쯤 다시 꺼내 드려요.</p>
        </div>
        <button type="button" className="btn light" onClick={create}>
          <Icon name="plus" size={18} strokeWidth={2.2} />새 릭 적기
        </button>
      </header>

      {due.length > 0 && (
        <section className="card accent" aria-label="오늘의 복습" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 18 }}>
          <span style={{ width: 52, height: 52, borderRadius: 16, background: 'var(--accent)', color: '#000', display: 'grid', placeItems: 'center', flex: 'none' }}>
            <Icon name="repeat" size={24} strokeWidth={2.2} />
          </span>
          <div style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <strong style={{ fontSize: 19 }}>오늘 복습할 릭 {due.length}개</strong>
            <span className="muted" style={{ fontSize: 14 }}>잘 기억나면 간격이 길어지고, 헷갈리면 금방 다시 나와요.</span>
          </div>
          <Link to="/licks/review" className="btn primary">복습 시작</Link>
        </section>
      )}

      <div className="card-head" style={{ alignItems: 'center' }}>
        <div className="chips" style={{ gap: 6 }}>
          <button type="button" className="tag-chip" aria-pressed={!tag && !favOnly} onClick={() => { setTag(null); setFavOnly(false); }}>
            전체 {licks.length}
          </button>
          <button type="button" className="tag-chip" aria-pressed={favOnly} onClick={() => setFavOnly((v) => !v)}>
            ★ 즐겨찾기
          </button>
          {tags.map((t) => (
            <button key={t} type="button" className="tag-chip" aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}>
              #{t}
            </button>
          ))}
        </div>
        <div className="chips" style={{ gap: 10, alignItems: 'center' }}>
          <Segmented label="정렬" value={sort} onChange={setSort} options={[{ value: 'due', label: '복습 순' }, { value: 'recent', label: '최근' }, { value: 'title', label: '이름' }]} />
          <label className="search" style={{ width: 220 }}>
            <Icon name="search" size={18} strokeWidth={2} />
            <span className="sr-only">릭 검색</span>
            <input type="search" placeholder="이름, 곡, 태그, 메모" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        </div>
      </div>

      {licksQ.loading && !licksQ.data ? (
        <p className="muted">불러오는 중…</p>
      ) : visible.length === 0 ? (
        <div className="empty">
          <Icon name="star" size={32} />
          <strong style={{ fontSize: 18 }}>{licks.length ? '조건에 맞는 릭이 없어요' : '아직 저장한 릭이 없어요'}</strong>
          {!licks.length && (
            <span className="muted" style={{ maxWidth: 440, lineHeight: 1.6 }}>
              플레이어에서 반복 구간을 만든 뒤 <strong>이 구간을 릭으로</strong>를 누르거나, 위의 <strong>새 릭 적기</strong>로 타브를 바로 적어 보세요.
            </span>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 18 }}>
          {visible.map((l) => (
            <LickCard key={l.id} lick={l} song={songs.get(l.songId ?? '') ?? null} />
          ))}
        </div>
      )}
    </div>
  );
}

function LickCard({ lick, song }: { lick: Lick; song: Song | null }) {
  const best = bestBpm(lick);
  const goal = lick.bpmGoal;
  const pct = best && goal ? Math.min(100, Math.round((best / goal) * 100)) : null;
  const due = isDue(lick.srs);
  return (
    <article className="lick-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <Link to={`/tabs/${lick.id}`} style={{ color: 'var(--text)', fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em' }}>
            {lick.favorite && <span style={{ color: 'var(--accent)' }}>★ </span>}
            {lick.title}
          </Link>
          <span className="muted" style={{ fontSize: 13 }}>{song ? `${song.title}에서` : '직접 적은 릭'} · {lick.tab.tuningLabel} · {lick.tab.bpm} BPM</span>
        </div>
      </div>
      <Link to={`/tabs/${lick.id}`} className="tab-preview" aria-label={`${lick.title} 타브 열기`}>
        <TabStaff tab={lick.tab} compact maxMeasures={2} />
      </Link>
      {lick.tags.length > 0 && (
        <div className="chips" style={{ gap: 6 }}>
          {lick.tags.map((t) => (
            <span key={t} className="chip" style={{ fontSize: 12, background: 'var(--surface-2)', color: 'var(--text-3)' }}>
              #{t}
            </span>
          ))}
        </div>
      )}
      {pct !== null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="muted" style={{ fontSize: 13 }}>
            최고 <strong className="mono" style={{ color: 'var(--text)' }}>{best}</strong> / 목표 {goal} BPM
          </span>
          <div className="progress"><span style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--green)' : 'var(--accent)' }} /></div>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: due ? 'var(--accent-text)' : 'var(--text-4)' }}>
          <span className={`dot ${due ? 'orange' : ''}`} />
          {due ? '오늘 복습' : `${dueLabel(lick.srs)} 복습`}
        </span>
        <div className="chips" style={{ gap: 8 }}>
          {song && lick.source && (
            <Link to={`/player/${song.id}`} className="btn sm">원곡</Link>
          )}
          <Link to={`/tabs/${lick.id}`} className="btn sm light">타브 편집</Link>
        </div>
      </div>
    </article>
  );
}
