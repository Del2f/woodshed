import { NavLink, Link } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { useStore } from '../lib/store/StoreProvider';

interface Item {
  to: string;
  label: string;
  icon: IconName;
  soon?: boolean;
  end?: boolean;
}

const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: '연습',
    items: [
      { to: '/', label: '라이브러리', icon: 'library', end: true },
      { to: '/player', label: '플레이어', icon: 'wave' },
      { to: '/tabs', label: '타브 에디터', icon: 'tab', soon: true },
      { to: '/licks', label: '릭 보관함', icon: 'star', soon: true },
    ],
  },
  { label: '배우기', items: [{ to: '/learn', label: '이론 커리큘럼', icon: 'book', soon: true }] },
  {
    label: '도구',
    items: [
      { to: '/tuner', label: '튜너', icon: 'tuner' },
      { to: '/metronome', label: '메트로놈', icon: 'metronome' },
    ],
  },
];

export function Sidebar() {
  const { store, session } = useStore();
  const cloud = store.kind === 'supabase';

  return (
    <nav className="sidebar" aria-label="주 메뉴">
      <Link to="/" className="brand">
        <span className="brand-mark">
          <Icon name="pick" size={18} />
        </span>
        <span className="brand-name">Woodshed</span>
      </Link>

      {GROUPS.map((g) => (
        <div key={g.label}>
          <div className="nav-label">{g.label}</div>
          <div className="nav-list">
            {g.items.map((it) => (
              <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                <Icon name={it.icon} />
                {it.label}
                {it.soon && <span className="nav-soon">곧</span>}
              </NavLink>
            ))}
          </div>
        </div>
      ))}

      <Link to="/settings" className="status-card">
        <span className="status-line">
          <span className={`dot ${cloud ? 'green' : 'orange'}`} />
          {cloud ? '클라우드에 저장 중' : '이 브라우저에만 저장 중'}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
          {cloud ? session?.user.email : '설정에서 Supabase에 연결하세요'}
        </span>
      </Link>
    </nav>
  );
}
