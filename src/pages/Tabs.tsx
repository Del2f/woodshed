import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { useStore } from '../lib/store/StoreProvider';
import { useAsync } from '../lib/useAsync';
import { newLick } from '../features/licks/licks';
import { relativeDay } from '../lib/songs';

/** 타브 에디터 첫 화면: 최근 편집한 타브 + 새로 적기 */
export function Tabs() {
  const { store, version, bump } = useStore();
  const navigate = useNavigate();
  const licksQ = useAsync(() => store.listLicks(), [store, version]);
  const licks = licksQ.data ?? [];

  const create = async () => {
    const l = newLick({});
    await store.upsertLick(l);
    bump();
    navigate(`/tabs/${l.id}`);
  };

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <header className="page-head">
        <div>
          <span className="eyebrow">타브 에디터</span>
          <h1 className="title-xl">손에 익은 걸 글로 남겨 두기</h1>
          <p className="lead">숫자로 프렛을 치고, 글자 하나로 주법을 붙여요. 적은 타브는 릭 보관함에 모여 복습할 때 나와요.</p>
        </div>
        <button type="button" className="btn primary" onClick={create}>
          <Icon name="plus" size={18} strokeWidth={2.2} />새 타브
        </button>
      </header>

      <section className="card">
        <div className="card-head">
          <h2 className="title-s">최근 편집</h2>
          <Link to="/licks" style={{ fontSize: 14 }}>릭 보관함 전체 보기</Link>
        </div>
        {licks.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>아직 적은 타브가 없어요.</p>
        ) : (
          licks.slice(0, 12).map((l) => (
            <Link key={l.id} to={`/tabs/${l.id}`} className="file-row" style={{ color: 'var(--text)' }}>
              <span className="name" style={{ fontWeight: 600 }}>{l.title}</span>
              <span className="muted" style={{ fontSize: 13 }}>{l.tab.measures.length}마디 · {relativeDay(l.updatedAt)}</span>
            </Link>
          ))
        )}
      </section>

      <section className="card" aria-label="단축키">
        <h2 className="title-s">키보드로 빠르게</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px 24px', fontSize: 14, color: 'var(--text-2)' }}>
          {[
            ['0–9', '프렛 (빠르게 두 번 = 두 자리)'],
            ['← →', '칸 이동 · Shift = 마디 이동'],
            ['↑ ↓', '줄 이동'],
            ['Del', '지우기'],
            ['H  P  T', '해머링 · 풀링 · 태핑'],
            ['/  \\', '슬라이드 위 · 아래'],
            ['B  V', '벤딩 · 비브라토'],
            ['X  N  M', '뮤트 · 하모닉스 · 팜뮤트'],
            ['Space', '재생 / 멈춤'],
            ['Ctrl+Z  Ctrl+Y', '실행 취소 · 다시'],
          ].map(([k, v]) => (
            <span key={k} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span className="kbd" style={{ minWidth: 92, textAlign: 'center' }}>{k}</span>
              {v}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
