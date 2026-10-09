import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { detectPitch, midiName, nearestString, NOTE_NAMES, noteFromFrequency, TUNING_PRESETS, type NoteReading } from '../features/tuner/pitch';

const PREF_KEY = 'woodshed.tuner';
const IN_TUNE_CENTS = 5;

function loadPrefs(): { presetId: string; a4: number } {
  try {
    return { presetId: 'standard', a4: 440, ...JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') };
  } catch {
    return { presetId: 'standard', a4: 440 };
  }
}

type MicState = 'off' | 'starting' | 'on' | 'denied' | 'error';

export function Tuner() {
  const [prefs, setPrefs] = useState(loadPrefs);
  const [mic, setMic] = useState<MicState>('off');
  const [reading, setReading] = useState<NoteReading | null>(null);
  const stopRef = useRef<() => void>(() => undefined);
  const history = useRef<number[]>([]);
  const a4Ref = useRef(prefs.a4);
  a4Ref.current = prefs.a4;

  useEffect(() => {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
    } catch {
      /* 무시 */
    }
  }, [prefs]);

  const start = useCallback(async () => {
    setMic('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      src.connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      let silentFrames = 0;
      const timer = window.setInterval(() => {
        analyser.getFloatTimeDomainData(buf);
        const f = detectPitch(buf, ctx.sampleRate);
        if (f === null) {
          if (++silentFrames > 12) {
            history.current = [];
            setReading(null);
          }
          return;
        }
        silentFrames = 0;
        const r = noteFromFrequency(f, a4Ref.current);
        // 최근 5개 값의 중앙값으로 바늘 떨림을 줄인다 (반음 넘게 튀면 새로 시작)
        const h = history.current;
        if (h.length && Math.abs(h[h.length - 1] - r.midiFloat) > 0.7) h.length = 0;
        h.push(r.midiFloat);
        if (h.length > 5) h.shift();
        const median = [...h].sort((a, b) => a - b)[Math.floor(h.length / 2)];
        const midi = Math.round(median);
        setReading({
          midiFloat: median,
          midi,
          name: NOTE_NAMES[((midi % 12) + 12) % 12],
          octave: Math.floor(midi / 12) - 1,
          cents: Math.round((median - midi) * 100),
        });
      }, 50);
      stopRef.current = () => {
        window.clearInterval(timer);
        stream.getTracks().forEach((t) => t.stop());
        ctx.close().catch(() => undefined);
      };
      setMic('on');
    } catch (e) {
      setMic((e as DOMException).name === 'NotAllowedError' ? 'denied' : 'error');
    }
  }, []);

  const stop = useCallback(() => {
    stopRef.current();
    stopRef.current = () => undefined;
    setMic('off');
    setReading(null);
  }, []);

  useEffect(() => () => stopRef.current(), []);

  const preset = TUNING_PRESETS.find((p) => p.id === prefs.presetId) ?? TUNING_PRESETS[0];
  const near = reading ? nearestString(reading.midiFloat, preset.strings) : -1;
  const inTune = !!reading && Math.abs(reading.cents) <= IN_TUNE_CENTS;
  const needleColor = !reading ? 'var(--surface-4)' : inTune ? 'var(--green)' : 'var(--accent)';
  const targetMidi = near >= 0 ? preset.strings[near] : null;
  const offTarget = reading && targetMidi !== null ? Math.round((reading.midiFloat - targetMidi) * 100) : null;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <span className="eyebrow">튜너</span>
          <h1 className="title-xl">줄부터 맞추고 시작해요.</h1>
        </div>
        <div className="chips" style={{ alignItems: 'flex-end', gap: 12 }}>
          <label className="field" style={{ minWidth: 200 }}>
            <span>튜닝</span>
            <select className="select" value={prefs.presetId} onChange={(e) => setPrefs((p) => ({ ...p, presetId: e.target.value }))}>
              {TUNING_PRESETS.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </label>
          <label className="field" style={{ width: 120 }}>
            <span>기준음 A4</span>
            <select className="select" value={prefs.a4} onChange={(e) => setPrefs((p) => ({ ...p, a4: Number(e.target.value) }))}>
              {[432, 436, 438, 440, 442, 444].map((v) => (
                <option key={v} value={v}>{v} Hz</option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <section className="card lg" style={{ alignItems: 'center', gap: 24, padding: '40px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, color: inTune ? 'var(--green)' : 'var(--text)', transition: 'color 0.2s' }}>
          <span className="tuner-note">{reading ? reading.name : '—'}</span>
          <span style={{ fontSize: 32, fontWeight: 600, color: 'var(--text-4)' }}>{reading ? reading.octave : ''}</span>
        </div>

        <div className="meter" style={{ width: '100%', maxWidth: 640 }} aria-hidden="true">
          <div className="scale">
            {Array.from({ length: 11 }, (_, i) => (
              <span key={i} className={`tick${i === 5 ? ' center' : ''}`} />
            ))}
          </div>
          <span className="needle" style={{ left: `${50 + (reading ? Math.max(-50, Math.min(50, reading.cents)) : 0)}%`, background: needleColor }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: 640, fontSize: 13 }} className="muted">
          <span>낮음 −50</span>
          <span className="mono" role="status" style={{ fontSize: 18, fontWeight: 700, color: inTune ? 'var(--green)' : 'var(--text)' }}>
            {reading ? `${reading.cents > 0 ? '+' : ''}${reading.cents}¢` : mic === 'on' ? '줄을 튕겨 주세요' : ''}
          </span>
          <span>+50 높음</span>
        </div>

        {mic !== 'on' ? (
          <button type="button" className="btn primary" onClick={start} disabled={mic === 'starting'}>
            <Icon name="mic" size={18} />
            {mic === 'starting' ? '마이크 켜는 중…' : '마이크 켜기'}
          </button>
        ) : (
          <button type="button" className="btn" onClick={stop}>
            마이크 끄기
          </button>
        )}
        {mic === 'denied' && <p style={{ margin: 0, color: 'var(--red)', fontSize: 14 }}>마이크 권한이 거부됐어요. 주소창 왼쪽의 사이트 설정에서 허용해 주세요.</p>}
        {mic === 'error' && <p style={{ margin: 0, color: 'var(--red)', fontSize: 14 }}>마이크를 켜지 못했어요. 오디오 인터페이스 연결을 확인해 주세요.</p>}
      </section>

      <section className="card">
        <div className="card-head">
          <h2 className="title-s">{preset.label}</h2>
          <span className="muted" style={{ fontSize: 13 }}>
            {offTarget !== null && near >= 0 ? `${preset.strings.length - near}번 줄 기준 ${offTarget > 0 ? '+' : ''}${offTarget}¢` : '낮은 줄 → 높은 줄'}
          </span>
        </div>
        <div className="string-pills">
          {preset.strings.map((m, i) => {
            const isNear = i === near;
            const ok = isNear && offTarget !== null && Math.abs(offTarget) <= IN_TUNE_CENTS;
            return (
              <div key={i} className={`string-pill${ok ? ' in-tune' : isNear ? ' near' : ''}`}>
                <span style={{ fontSize: 18, fontWeight: 700 }}>{midiName(m)}</span>
                <span className="muted" style={{ fontSize: 12 }}>{preset.strings.length - i}번 줄</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
