import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { LESSONS, lessonById } from '../features/learn/curriculum';
import { FretNotesLesson } from '../features/learn/FretNotesLesson';
import { TUNING_PRESETS } from '../features/tuner/pitch';

const PREF_KEY = 'woodshed.learn';

/** 이론 커리큘럼 목차 */
export function Learn() {
  const parts = [...new Set(LESSONS.map((l) => l.part))];
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <span className="eyebrow">이론 커리큘럼</span>
          <h1 className="title-xl">손은 이미 알아요. 이름만 붙이면 돼요</h1>
          <p className="lead">지판 음 이름에서 시작해 코드톤 타겟팅, 메탈 스케일까지 9개 레슨. 레슨마다 내 라이브러리의 곡을 예제로 쓰고, 퀴즈로 손에 익혀요.</p>
        </div>
      </header>

      {parts.map((part) => (
        <section key={part} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 className="title-s" style={{ color: 'var(--text-3)' }}>{part}</h2>
          <div className="lesson-grid">
            {LESSONS.filter((l) => l.part === part).map((l) => {
              const body = (
                <>
                  <div className="card-head" style={{ alignItems: 'center' }}>
                    <span className="lesson-num">{l.n}</span>
                    {l.ready ? <Icon name="forward" size={18} /> : <span className="chip">준비 중</span>}
                  </div>
                  <div className="song-title" style={{ fontSize: 18 }}>{l.title}</div>
                  <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>{l.summary}</p>
                  <div className="chips" style={{ gap: 6 }}>
                    {l.topics.map((t) => (
                      <span key={t} className="chip" style={{ fontSize: 12 }}>{t}</span>
                    ))}
                  </div>
                </>
              );
              return l.ready ? (
                <Link key={l.id} to={`/learn/${l.id}`} className="lesson-card ready">{body}</Link>
              ) : (
                <div key={l.id} className="lesson-card" aria-disabled>{body}</div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function loadPreset(): string {
  try {
    return JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}').presetId ?? 'standard';
  } catch {
    return 'standard';
  }
}

/** 레슨 한 개. 위쪽에서 고른 튜닝이 레슨의 모든 지판과 퀴즈에 쓰인다 */
export function Lesson() {
  const lesson = lessonById(useParams().lessonId);
  const [presetId, setPresetId] = useState(loadPreset);
  useEffect(() => {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({ presetId }));
    } catch {
      /* 무시 */
    }
  }, [presetId]);
  const preset = TUNING_PRESETS.find((p) => p.id === presetId) ?? TUNING_PRESETS[0];

  if (!lesson?.ready) return <Navigate to="/learn" replace />;

  return (
    <div className="page" style={{ maxWidth: 1040 }}>
      <header className="page-head">
        <div>
          <Link to="/learn" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 15 }}>
            <Icon name="back" size={18} strokeWidth={2} />
            이론 커리큘럼
          </Link>
          <span className="eyebrow">레슨 {lesson.n} · {lesson.part}</span>
          <h1 className="title-xl">{lesson.title}</h1>
          {lesson.intro && <p className="lead">{lesson.intro}</p>}
        </div>
        <label className="field" style={{ minWidth: 200 }}>
          <span>튜닝</span>
          <select className="select" value={preset.id} onChange={(e) => setPresetId(e.target.value)}>
            {TUNING_PRESETS.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </label>
      </header>

      {lesson.id === 'fretboard-notes' && <FretNotesLesson strings={preset.strings} />}
    </div>
  );
}
