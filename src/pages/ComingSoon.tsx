import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';

export function ComingSoon({ eyebrow, title, version, points }: { eyebrow: string; title: string; version: string; points: string[] }) {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h1 className="title-xl">{title}</h1>
        </div>
      </div>
      <section className="card lg" style={{ maxWidth: 640 }}>
        <span className="chip" style={{ alignSelf: 'flex-start', background: 'var(--accent-soft)', color: 'var(--accent-text)' }}>
          {version}에서 제공 예정
        </span>
        <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {points.map((p) => (
            <li key={p} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', lineHeight: 1.6, color: 'var(--text-2)' }}>
              <span style={{ color: 'var(--accent)', marginTop: 3 }}>
                <Icon name="check" size={16} strokeWidth={2.4} />
              </span>
              {p}
            </li>
          ))}
        </ul>
        <Link to="/" className="btn light" style={{ alignSelf: 'flex-start' }}>
          라이브러리로
        </Link>
      </section>
    </div>
  );
}
