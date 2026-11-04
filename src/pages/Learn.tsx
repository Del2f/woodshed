import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { LESSONS, TRACKS, lessonById, trackById } from '../features/learn/curriculum';
import { FretNotesLesson } from '../features/learn/FretNotesLesson';
import { LessonBlocks, rich } from '../features/learn/LessonBlocks';
import { TUNING_PRESETS } from '../features/tuner/pitch';

const PREF_KEY = 'woodshed.learn';

/** 커리큘럼 목차 — 트랙(지판과 이론 / 테크닉 / 실전 응용)마다 파트별로 */
export function Learn() {
  const ready = LESSONS.filter((l) => l.ready).length;
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <span className="eyebrow">커리큘럼</span>
          <h1 className="title-xl">손은 이미 알아요. 이름만 붙이면 돼요</h1>
          <p className="lead">
            지판과 이론, 테크닉, 실전 응용 세 갈래로 {LESSONS.length}개 레슨(지금 {ready}개 열림). 테크닉 연습은 지판·타브로 보고 들은 다음, 내 연습 목록에 넣어 BPM을 올려 가며 복습해요.
          </p>
        </div>
      </header>

      {TRACKS.map((track) => {
        const lessons = LESSONS.filter((l) => l.track === track.id);
        const parts = [...new Set(lessons.map((l) => l.part))];
        return (
          <section key={track.id} className="track" aria-labelledby={`track-${track.id}`}>
            <div>
              <h2 id={`track-${track.id}`} className="title-l">{track.title}</h2>
              <p className="muted" style={{ margin: '4px 0 0', fontSize: 14 }}>{track.summary}</p>
            </div>
            {parts.map((part) => (
              <div key={part} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <h3 className="title-s" style={{ color: 'var(--text-3)' }}>{part}</h3>
                <div className="lesson-grid">
                  {lessons.filter((l) => l.part === part).map((l) => {
                    const body = (
                      <>
                        <div className="card-head" style={{ alignItems: 'center' }}>
                          <span className="lesson-num">{l.n}</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {l.level && <span className="chip" style={{ fontSize: 12 }}>{l.level}</span>}
                            {l.ready ? <Icon name="forward" size={18} /> : <span className="chip">준비 중</span>}
                          </span>
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
              </div>
            ))}
          </section>
        );
      })}
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

/** 레슨 한 개. 위쪽에서 고른 튜닝이 레슨의 모든 지판·퀴즈·연습에 쓰인다 */
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
            커리큘럼
          </Link>
          <span className="eyebrow">
            {trackById(lesson.track).title} {lesson.n} · {lesson.part}
            {lesson.level && ` · ${lesson.level}`}
          </span>
          <h1 className="title-xl">{lesson.title}</h1>
          {lesson.intro && <p className="lead">{rich(lesson.intro)}</p>}
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

      {lesson.id === 'fretboard-notes' && <FretNotesLesson strings={preset.strings} tuningLabel={preset.label} />}
      {lesson.blocks && <LessonBlocks key={lesson.id} lessonId={lesson.id} blocks={lesson.blocks} strings={preset.strings} tuningLabel={preset.label} />}
    </div>
  );
}
