import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { Segmented, Switch } from '../components/controls';
import { clampBpm, MAX_BPM, MetronomeEngine, MIN_BPM, tapTempo, type MetronomeSettings } from '../features/metronome/engine';

const PREF_KEY = 'woodshed.metronome';
const DEFAULTS: MetronomeSettings = { bpm: 120, beatsPerBar: 4, subdivision: 1, accent: true, volume: 0.8 };

function loadPrefs(): MetronomeSettings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
}

const TEMPO_NAMES: [number, string][] = [
  [60, 'Largo'],
  [76, 'Adagio'],
  [108, 'Andante'],
  [120, 'Moderato'],
  [168, 'Allegro'],
  [200, 'Presto'],
  [Infinity, 'Prestissimo'],
];

export function Metronome() {
  const [s, setS] = useState<MetronomeSettings>(loadPrefs);
  const [running, setRunning] = useState(false);
  const [lit, setLit] = useState(-1);
  const engine = useRef<MetronomeEngine | null>(null);
  const taps = useRef<number[]>([]);

  // 엔진은 한 번만 만들고, 이후 설정 변경은 update()로 전달한다
  useEffect(() => {
    engine.current = new MetronomeEngine(loadPrefs(), (beat) => setLit(beat));
    return () => engine.current?.dispose();
  }, []);

  useEffect(() => {
    engine.current?.update(s);
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(s));
    } catch {
      /* 저장 못 해도 동작에는 문제 없음 */
    }
  }, [s]);

  const toggle = useCallback(async () => {
    const e = engine.current;
    if (!e) return;
    if (e.running) {
      e.stop();
      setRunning(false);
      setLit(-1);
    } else {
      await e.start();
      setRunning(true);
    }
  }, []);

  const setBpm = useCallback((bpm: number) => setS((p) => ({ ...p, bpm: clampBpm(bpm) })), []);

  const tap = useCallback(() => {
    const now = performance.now();
    taps.current = [...taps.current.slice(-7), now];
    const bpm = tapTempo(taps.current);
    if (bpm) setBpm(bpm);
  }, [setBpm]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === ' ' && !el.closest('button')) {
        e.preventDefault();
        toggle();
      } else if (e.key === 'ArrowRight') setS((p) => ({ ...p, bpm: clampBpm(p.bpm + 1) }));
      else if (e.key === 'ArrowLeft') setS((p) => ({ ...p, bpm: clampBpm(p.bpm - 1) }));
      else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setS((p) => ({ ...p, bpm: clampBpm(p.bpm + 5) }));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setS((p) => ({ ...p, bpm: clampBpm(p.bpm - 5) }));
      } else if (e.key.toLowerCase() === 't') tap();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, tap]);

  const tempoName = TEMPO_NAMES.find(([max]) => s.bpm < max)![1];

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <span className="eyebrow">메트로놈</span>
          <h1 className="title-xl">박자는 정확하게.</h1>
        </div>
      </header>

      <section className="card lg" style={{ alignItems: 'center', gap: 28, padding: '40px 28px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <span className="bpm-display mono">{s.bpm}</span>
          <span className="muted" style={{ fontSize: 15 }}>
            BPM · {tempoName}
          </span>
        </div>

        <div className="beats" aria-hidden="true">
          {Array.from({ length: s.beatsPerBar }, (_, i) => (
            <span key={i} className={`beat${i === 0 && s.accent ? ' accented' : ''}${lit === i ? ' lit' : ''}`} />
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, width: '100%', maxWidth: 560 }}>
          <button type="button" className="icon-btn" aria-label="BPM 1 내리기" onClick={() => setBpm(s.bpm - 1)}>
            <span style={{ fontSize: 22, fontWeight: 600 }}>−</span>
          </button>
          <label style={{ flex: 1 }}>
            <span className="sr-only">BPM</span>
            <input type="range" min={MIN_BPM} max={MAX_BPM} value={s.bpm} onChange={(e) => setBpm(Number(e.target.value))} />
          </label>
          <button type="button" className="icon-btn" aria-label="BPM 1 올리기" onClick={() => setBpm(s.bpm + 1)}>
            <Icon name="plus" size={20} strokeWidth={2.2} />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <button type="button" className="btn" onClick={tap} style={{ minWidth: 96 }}>
            탭
          </button>
          <button type="button" className={`play-btn${running ? '' : ' accent'}`} aria-label={running ? '정지 (Space)' : '시작 (Space)'} onClick={toggle}>
            <Icon name={running ? 'pause' : 'play'} size={28} />
          </button>
          <div style={{ minWidth: 96 }} />
        </div>
      </section>

      <div className="grid-auto">
        <section className="card">
          <h2 className="title-s">박자</h2>
          <Segmented
            label="박자표"
            fill
            value={s.beatsPerBar}
            onChange={(v) => setS((p) => ({ ...p, beatsPerBar: v }))}
            options={[2, 3, 4, 5, 6, 7].map((n) => ({ value: n, label: `${n}/4` }))}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span>첫 박 강세</span>
            <Switch label="첫 박 강세" checked={s.accent} onChange={(v) => setS((p) => ({ ...p, accent: v }))} />
          </div>
        </section>
        <section className="card">
          <h2 className="title-s">분할</h2>
          <Segmented
            label="박 분할"
            fill
            value={s.subdivision}
            onChange={(v) => setS((p) => ({ ...p, subdivision: v }))}
            options={[
              { value: 1, label: '4분' },
              { value: 2, label: '8분' },
              { value: 3, label: '셋잇단' },
              { value: 4, label: '16분' },
            ]}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ width: 40 }}>볼륨</span>
            <input type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => setS((p) => ({ ...p, volume: Number(e.target.value) }))} />
          </label>
        </section>
      </div>

      <p className="muted" style={{ fontSize: 13, margin: 0 }}>
        <span className="kbd">Space</span> 시작/정지 · <span className="kbd">←</span> <span className="kbd">→</span> ±1 · <span className="kbd">↑</span>{' '}
        <span className="kbd">↓</span> ±5 · <span className="kbd">T</span> 탭 템포
      </p>
    </div>
  );
}
