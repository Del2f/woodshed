import { memo, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Segmented, Switch } from '../../components/controls';
import { Fretboard, FretboardLegend, type FretboardMode } from '../../components/Fretboard';
import type { EngineHealth } from '../../lib/engine';
import type { ChordSegment, SongAnalysis } from '../../lib/store/types';
import { barAt, chordTones, explainChord, FN_LABEL, parseChord, romanNumeral, scaleForChord, type Key } from '../../lib/theory';

// ── 분석 시작/진행 카드 ─────────────────────────

export function AnalyzeCard({
  health,
  analysis,
  canAnalyze,
  job,
  onAnalyze,
}: {
  health: EngineHealth | null;
  analysis: SongAnalysis | null;
  canAnalyze: boolean;
  job: { step: string; progress: number; error: string | null } | null;
  onAnalyze: (separate: boolean) => void;
}) {
  const sepAvailable = !!health?.features.separation;
  const [separate, setSeparate] = useState(true);
  const running = !!job && !job.error && job.progress < 1;

  return (
    <section className={`card${analysis ? '' : ' accent'}`} aria-label="음원 분석" style={{ flex: '1 1 320px' }}>
      <div className="card-head">
        <h2 className="title-s">{analysis ? '분석 결과' : '이 곡 분석하기'}</h2>
        <span className="status-line" style={{ fontSize: 12 }}>
          <span className={`dot ${health ? 'green' : ''}`} />
          {health ? `분석 엔진 연결됨${health.features.gpu ? ' · GPU' : ''}` : '분석 엔진 꺼짐'}
        </span>
      </div>

      {analysis && (
        <div className="chips">
          <span className="chip">{analysis.key.name.endsWith('m') ? `${analysis.key.name.slice(0, -1)} 마이너` : `${analysis.key.name} 메이저`}</span>
          <span className="chip">{Math.round(analysis.bpm)} BPM</span>
          <span className="chip">코드 {new Set(analysis.chords.filter((c) => c.label !== 'N').map((c) => c.label)).size}종</span>
          {analysis.stems.length > 0 && <span className="chip">기타 분리됨</span>}
        </div>
      )}

      {!analysis && (
        <p className="lead" style={{ fontSize: 14 }}>
          내 PC의 분석 엔진이 박자·키·코드 진행을 찾아요. 음원은 이 PC 안에서만 처리돼요.
        </p>
      )}

      {running && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} role="status">
          <span style={{ fontSize: 14, fontWeight: 600 }}>{job.step}</span>
          <div className="progress">
            <span style={{ width: `${Math.round(job.progress * 100)}%`, background: 'var(--blue)', transition: 'width 0.5s var(--ease)' }} />
          </div>
        </div>
      )}
      {job?.error && <p style={{ margin: 0, color: 'var(--red)', fontSize: 14, lineHeight: 1.5 }}>{job.error}</p>}

      {health ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 'auto' }}>
          {sepAvailable && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, flex: 1 }}>
              <Switch label="기타 트랙 분리" checked={separate} onChange={setSeparate} />
              기타 트랙도 분리
            </label>
          )}
          <button type="button" className={`btn ${analysis ? '' : 'primary'}`} disabled={!canAnalyze || running} onClick={() => onAnalyze(sepAvailable && separate)}>
            {running ? '분석 중…' : analysis ? '다시 분석' : '분석 시작'}
          </button>
        </div>
      ) : (
        <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
          엔진을 켜면 바로 분석할 수 있어요. <Link to="/engine">켜는 방법 보기</Link>
        </p>
      )}
    </section>
  );
}

// ── 코드 흐름 ─────────────────────────

export function ChordFlow({
  chords,
  keyInfo,
  downbeats,
  current,
  onSeek,
}: {
  chords: ChordSegment[];
  keyInfo: Key | null;
  downbeats: number[];
  current: number;
  onSeek: (t: number) => void;
}) {
  const playable = useMemo(() => chords.filter((c) => c.label !== 'N'), [chords]);
  let idx = playable.findIndex((c) => current >= c.start && current < c.end);
  if (idx < 0) idx = Math.max(0, playable.findIndex((c) => c.start > current) - 1);
  const from = Math.max(0, idx - 2);
  const view = playable.slice(from, from + 9);

  return (
    <section className="card" aria-label="코드 흐름" style={{ padding: '24px 28px' }}>
      <div className="card-head">
        <h2 className="title-s">코드 흐름</h2>
        <span className="muted" style={{ fontSize: 13 }}>
          {keyInfo ? `숫자는 ${keyInfo.tonicName} ${keyInfo.mode === 'minor' ? '마이너' : '메이저'} 키 안에서의 역할 · 눌러서 이동` : '눌러서 그 위치로 이동'}
        </span>
      </div>
      {view.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>코드를 찾지 못했어요.</p>
      ) : (
        <div className="chord-flow">
          {view.map((seg, i) => {
            const absolute = from + i;
            const chord = parseChord(seg.label);
            const state = absolute === idx && current >= seg.start ? ' now' : absolute < idx ? ' past' : '';
            return (
              <button key={`${seg.start}-${seg.label}`} type="button" className={`chord-block${state}`} onClick={() => onSeek(seg.start)} aria-current={state === ' now' ? 'true' : undefined}>
                <span className="bar">마디 {barAt(seg.start, downbeats)}</span>
                <span className="name">{seg.label}</span>
                <span className="roman">{chord && keyInfo ? romanNumeral(chord, keyInfo) : ' '}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ── 지금 코드: 지판 + 설명 ─────────────────────────

const MODES: { value: FretboardMode; label: string }[] = [
  { value: 'tones', label: '코드톤' },
  { value: 'scale', label: '스케일' },
  { value: 'names', label: '음 이름' },
];

const TONE_STYLE: Record<string, { bg: string; fg: string }> = {
  R: { bg: '#FF9F0A', fg: '#000' },
  '3': { bg: '#0060DF', fg: '#fff' },
  b3: { bg: '#0060DF', fg: '#fff' },
  '5': { bg: '#E5E5EA', fg: '#000' },
  b7: { bg: '#BF5AF2', fg: '#000' },
};

export const ChordNow = memo(function ChordNow({ label, keyInfo, strings }: { label: string | null; keyInfo: Key | null; strings: number[] }) {
  const [mode, setMode] = useState<FretboardMode>('tones');
  const chord = label ? parseChord(label) : null;
  const scale = useMemo(() => (chord ? scaleForChord(chord, keyInfo) : null), [chord?.label, keyInfo?.tonic, keyInfo?.mode]);
  const info = chord ? explainChord(chord, keyInfo) : null;

  return (
    <div className="row">
      <section className="card" aria-label="지판" style={{ flex: '3 1 600px', padding: '24px 28px', gap: 18 }}>
        <div className="card-head" style={{ alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <h2 className="title-s">지판 위의 {chord ? chord.label : '코드'}</h2>
            <span className="muted" style={{ fontSize: 13 }}>{scale ? `${scale.name} 위에 코드톤 표시` : '코드가 없는 구간이에요'}</span>
          </div>
          <Segmented label="지판 표시 방식" options={MODES} value={mode} onChange={setMode} />
        </div>
        <Fretboard strings={strings} chord={chord} scale={scale} mode={mode} />
        <FretboardLegend />
      </section>

      <aside className="card accent" aria-label="지금 코드 설명" style={{ flex: '1 1 300px', gap: 14 }}>
        <span className="eyebrow" style={{ fontSize: 13, letterSpacing: '0.04em' }}>지금 코드</span>
        {chord && info ? (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 48, fontWeight: 700, letterSpacing: '-0.04em' }}>{chord.label}</span>
              {info.roman && <span style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-3)' }}>{info.roman}</span>}
            </div>
            <div className="chips" style={{ gap: 6 }}>
              {chordTones(chord).map((t) => (
                <span key={t.pc} className="tone-pill" style={{ background: TONE_STYLE[t.fn].bg, color: TONE_STYLE[t.fn].fg }}>
                  {t.name} · {FN_LABEL[t.fn]}
                </span>
              ))}
            </div>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: '#e5e5ea' }}>{info.role}</p>
            <p style={{ margin: 0, padding: 14, borderRadius: 14, background: 'rgba(0,0,0,0.35)', fontSize: 14, lineHeight: 1.6, color: 'var(--text-2)' }}>
              <strong style={{ color: 'var(--accent-text)' }}>솔로 팁</strong> {info.tip}
            </p>
            <span className="muted" style={{ fontSize: 13, marginTop: 'auto' }}>
              <Icon name="book" size={14} /> 이론 커리큘럼(레슨 06 코드톤 타겟팅)은 v0.4에서 제공돼요
            </span>
          </>
        ) : (
          <p className="lead" style={{ fontSize: 14 }}>잠깐 쉬어 가는 구간이에요. 재생하면 코드에 맞춰 바뀌어요.</p>
        )}
      </aside>
    </div>
  );
});
