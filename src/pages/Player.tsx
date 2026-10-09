import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin, { type Region } from 'wavesurfer.js/dist/plugins/regions.esm.js';
import { Icon } from '../components/Icon';
import { Segmented, Switch } from '../components/controls';
import { useStore } from '../lib/store/StoreProvider';
import { useAsync } from '../lib/useAsync';
import { rememberSessionFile, requestFolderAccess, resolveSongFile } from '../lib/audioFolder';
import { formatTime, KEY_OPTIONS, keyLabel, uid } from '../lib/format';
import { relativeDay, tileColor } from '../lib/songs';
import { TUNINGS, type LoopSection, type Song } from '../lib/store/types';
import { clampRate, DEFAULT_TRAINER, MAX_RATE, MIN_RATE, rateAfterLoop, type TrainerConfig } from '../features/player/speedTrainer';

const REGION_COLOR = 'rgba(255, 159, 10, 0.16)';
const SPEED_PRESETS = [0.5, 0.7, 0.85, 1, 1.1];
/** 이 시간 이상 연습했을 때만 기록 (초) */
const MIN_SESSION = 15;
/** 오래 켜 두면 중간중간 나눠서 저장 (초) */
const CHUNK_SESSION = 300;

type FileState = 'loading' | 'ok' | 'need-permission' | 'missing';
interface Range {
  start: number;
  end: number;
}

export function PlayerLanding() {
  const { store, version } = useStore();
  const songsQ = useAsync(() => store.listSongs(), [store, version]);
  const songs = songsQ.data ?? [];
  const sorted = [...songs].sort((a, b) => (b.lastPracticedAt ?? '').localeCompare(a.lastPracticedAt ?? ''));
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">플레이어</span>
          <h1 className="title-xl">어떤 곡을 열까요?</h1>
        </div>
      </div>
      {songs.length === 0 && !songsQ.loading ? (
        <div className="empty">
          <Icon name="library" size={32} />
          <strong style={{ fontSize: 18 }}>라이브러리에 곡이 없어요</strong>
          <Link to="/" className="btn light">
            라이브러리로
          </Link>
        </div>
      ) : (
        <section className="card">
          {sorted.map((s) => (
            <Link key={s.id} to={`/player/${s.id}`} className="file-row" style={{ color: 'var(--text)' }}>
              <span
                style={{ width: 40, height: 40, borderRadius: 10, display: 'grid', placeItems: 'center', fontWeight: 700, background: tileColor(s.id).bg, color: tileColor(s.id).fg, flex: 'none' }}
              >
                {s.musicalKey ?? '—'}
              </span>
              <span className="name" style={{ fontWeight: 600 }}>
                {s.title}
              </span>
              <span className="muted" style={{ fontSize: 13 }}>
                {s.lastPracticedAt ? relativeDay(s.lastPracticedAt) : '연습 전'}
              </span>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}

export function Player() {
  const { songId = '' } = useParams();
  const navigate = useNavigate();
  const { store, bump } = useStore();
  const songQ = useAsync(() => store.getSong(songId), [store, songId]);
  const loopsQ = useAsync(() => store.listLoops(songId), [store, songId]);

  const [song, setSong] = useState<Song | null>(null);
  const [loops, setLoops] = useState<LoopSection[]>([]);
  useEffect(() => {
    if (songQ.data !== undefined) setSong(songQ.data);
  }, [songQ.data]);
  useEffect(() => {
    if (loopsQ.data) setLoops(loopsQ.data);
  }, [loopsQ.data]);

  // ── 음원 파일 찾기 ──
  const [file, setFile] = useState<File | null>(null);
  const [fileState, setFileState] = useState<FileState>('loading');
  const [permHandle, setPermHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const fileName = song?.fileName;

  const resolve = useCallback(async () => {
    if (!fileName) return;
    const r = await resolveSongFile(fileName);
    if (r.status === 'ok') {
      setFile(r.file);
      setFileState('ok');
    } else if (r.status === 'need-permission') {
      setPermHandle(r.handle);
      setFileState('need-permission');
    } else {
      setFileState('missing');
    }
  }, [fileName]);

  useEffect(() => {
    setFile(null);
    setFileState('loading');
    resolve();
  }, [resolve]);

  const allowFolder = async () => {
    if (permHandle && (await requestFolderAccess(permHandle))) resolve();
  };
  const pickManually = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    rememberSessionFile(f);
    setFile(f);
    setFileState('ok');
  };

  // ── 재생 상태 ──
  const waveEl = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);
  const [loopOn, setLoopOn] = useState(false);
  const [range, setRange] = useState<Range | null>(null);
  const [activeLoopId, setActiveLoopId] = useState<string | null>(null);
  const [loopCount, setLoopCount] = useState(0);
  const [trainer, setTrainer] = useState<TrainerConfig>(DEFAULT_TRAINER);
  const [pendingStart, setPendingStart] = useState<number | null>(null);

  // 이벤트 핸들러에서 최신 값을 읽기 위한 ref
  const rateRef = useRef(rate);
  const loopOnRef = useRef(loopOn);
  const rangeRef = useRef(range);
  const trainerRef = useRef(trainer);
  const loopCountRef = useRef(0);
  const pendingLoopIdRef = useRef<string | null>(null);
  const activeLoopIdRef = useRef<string | null>(null);
  loopOnRef.current = loopOn;
  rangeRef.current = range;
  trainerRef.current = trainer;
  activeLoopIdRef.current = activeLoopId;

  useEffect(() => {
    rateRef.current = rate;
    wsRef.current?.setPlaybackRate(rate, true);
  }, [rate]);

  // ── 연습 시간 기록 ──
  const storeRef = useRef(store);
  const songRef = useRef(song);
  storeRef.current = store;
  songRef.current = song;
  const practice = useRef({ startedAt: null as string | null, playStart: 0, accum: 0 });

  const flushPractice = useCallback(async () => {
    const p = practice.current;
    if (p.playStart) {
      p.accum += (performance.now() - p.playStart) / 1000;
      p.playStart = wsRef.current?.isPlaying() ? performance.now() : 0;
    }
    const s = songRef.current;
    if (p.accum < MIN_SESSION || !p.startedAt || !s) return;
    const session = { id: uid(), songId: s.id, startedAt: p.startedAt, durationSec: Math.round(p.accum) };
    p.accum = 0;
    p.startedAt = p.playStart ? new Date().toISOString() : null;
    const updated: Song = { ...s, lastPracticedAt: new Date().toISOString(), lastLoopId: activeLoopIdRef.current ?? s.lastLoopId };
    songRef.current = updated;
    setSong(updated);
    try {
      await storeRef.current.addSession(session);
      await storeRef.current.upsertSong(updated);
    } catch (e) {
      console.error('연습 기록 저장 실패', e);
    }
  }, []);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flushPractice();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flushPractice);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flushPractice);
      flushPractice().then(() => bump());
    };
  }, [flushPractice, bump]);

  const onLoopComplete = useCallback(() => {
    loopCountRef.current += 1;
    setLoopCount(loopCountRef.current);
    const next = rateAfterLoop(rateRef.current, loopCountRef.current, trainerRef.current);
    if (next !== rateRef.current) setRate(next);
  }, []);

  // ── WaveSurfer ──
  useEffect(() => {
    if (!file || !waveEl.current) return;
    const url = URL.createObjectURL(file);
    const regions = RegionsPlugin.create();
    const ws = WaveSurfer.create({
      container: waveEl.current,
      url,
      height: 150,
      waveColor: '#48484A',
      progressColor: '#8E8E93',
      cursorColor: '#F5F5F7',
      cursorWidth: 2,
      barWidth: 2,
      barGap: 2,
      barRadius: 2,
      normalize: true,
      plugins: [regions],
    });
    wsRef.current = ws;
    regionsRef.current = regions;
    const disableDrag = regions.enableDragSelection({ color: REGION_COLOR });

    const applyRegion = (r: Region) => setRange({ start: r.start, end: r.end });

    ws.on('ready', (d) => {
      setDuration(d);
      setReady(true);
      ws.setPlaybackRate(rateRef.current, true);
      const s = songRef.current;
      if (s && !s.durationSec) {
        const updated = { ...s, durationSec: Math.round(d) };
        songRef.current = updated;
        setSong(updated);
        storeRef.current.upsertSong(updated).catch(console.error);
      }
    });
    ws.on('timeupdate', (t) => {
      setCurrent(t);
      const r = rangeRef.current;
      if (loopOnRef.current && r && ws.isPlaying() && t >= r.end) {
        ws.setTime(r.start);
        onLoopComplete();
      }
    });
    ws.on('play', () => {
      setPlaying(true);
      const r = rangeRef.current;
      const t = ws.getCurrentTime();
      if (loopOnRef.current && r && (t < r.start || t >= r.end - 0.05)) ws.setTime(r.start);
      const p = practice.current;
      p.startedAt ??= new Date().toISOString();
      p.playStart = performance.now();
    });
    ws.on('pause', () => {
      setPlaying(false);
      const p = practice.current;
      if (p.playStart) {
        p.accum += (performance.now() - p.playStart) / 1000;
        p.playStart = 0;
      }
      if (p.accum >= CHUNK_SESSION) flushPractice();
    });

    regions.on('region-created', (r) => {
      regions.getRegions().forEach((o) => o !== r && o.remove());
      applyRegion(r);
      setActiveLoopId(pendingLoopIdRef.current);
      pendingLoopIdRef.current = null;
      setLoopOn(true);
      setPendingStart(null);
      loopCountRef.current = 0;
      setLoopCount(0);
    });
    regions.on('region-update', applyRegion);
    regions.on('region-updated', (r) => {
      applyRegion(r);
      setActiveLoopId(null); // 저장된 구간을 움직이면 '수정됨' 상태
    });

    return () => {
      disableDrag();
      ws.destroy();
      URL.revokeObjectURL(url);
      wsRef.current = null;
      regionsRef.current = null;
      setReady(false);
      setPlaying(false);
    };
  }, [file, onLoopComplete, flushPractice]);

  const loadLoop = useCallback((l: LoopSection) => {
    const regions = regionsRef.current;
    const ws = wsRef.current;
    if (!regions || !ws) return;
    regions.clearRegions();
    pendingLoopIdRef.current = l.id;
    regions.addRegion({ start: l.start, end: l.end, color: REGION_COLOR, drag: true, resize: true });
    setRate(clampRate(l.speed));
    ws.setTime(l.start);
  }, []);

  // 마지막으로 연습한 구간 복원
  const restored = useRef(false);
  useEffect(() => {
    if (!ready || restored.current || !loopsQ.data || !song) return;
    restored.current = true;
    const last = loopsQ.data.find((l) => l.id === song.lastLoopId);
    if (last) loadLoop(last);
  }, [ready, loopsQ.data, song, loadLoop]);

  // ── 조작 ──
  const togglePlay = useCallback(() => wsRef.current?.playPause(), []);
  const seekBy = useCallback((d: number) => {
    const ws = wsRef.current;
    if (ws) ws.setTime(Math.max(0, Math.min(ws.getDuration(), ws.getCurrentTime() + d)));
  }, []);
  const toStart = useCallback(() => {
    const ws = wsRef.current;
    if (ws) ws.setTime(rangeRef.current && loopOnRef.current ? rangeRef.current.start : 0);
  }, []);
  const clearLoop = useCallback(() => {
    regionsRef.current?.clearRegions();
    setRange(null);
    setActiveLoopId(null);
    setLoopOn(false);
    setPendingStart(null);
  }, []);

  const markA = useCallback(() => {
    const ws = wsRef.current;
    if (!ws) return;
    const t = ws.getCurrentTime();
    const region = regionsRef.current?.getRegions()[0];
    if (region && t < region.end) {
      region.setOptions({ start: t });
      setRange({ start: t, end: region.end });
      setActiveLoopId(null);
    } else {
      regionsRef.current?.clearRegions();
      setRange(null);
      setPendingStart(t);
    }
  }, []);
  const markB = useCallback(() => {
    const ws = wsRef.current;
    const regions = regionsRef.current;
    if (!ws || !regions) return;
    const t = ws.getCurrentTime();
    const region = regions.getRegions()[0];
    if (pendingStart !== null && t > pendingStart + 0.2) {
      regions.addRegion({ start: pendingStart, end: t, color: REGION_COLOR, drag: true, resize: true });
    } else if (region && t > region.start) {
      region.setOptions({ end: t });
      setRange({ start: region.start, end: t });
      setActiveLoopId(null);
    }
  }, [pendingStart]);

  // 키보드 단축키
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, select, textarea, [contenteditable="true"]') || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === ' ') {
        if (el.closest('button')) return; // 버튼 포커스 중 스페이스는 버튼 기본 동작
        e.preventDefault();
        togglePlay();
      } else if (k === 'l') setLoopOn((v) => !v);
      else if (k === 'arrowleft') seekBy(-5);
      else if (k === 'arrowright') seekBy(5);
      else if (k === '[') setRate((r) => clampRate(r - 0.05));
      else if (k === ']') setRate((r) => clampRate(r + 0.05));
      else if (k === 'a') markA();
      else if (k === 'b') markB();
      else if (k === 'home' || k === '0') toStart();
      else return;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, seekBy, markA, markB, toStart]);

  // ── 저장 ──
  const [loopName, setLoopName] = useState('');
  const saveLoop = async () => {
    if (!range || !song) return;
    const loop: LoopSection = {
      id: uid(),
      songId: song.id,
      name: loopName.trim() || `구간 ${formatTime(range.start)}–${formatTime(range.end)}`,
      start: range.start,
      end: range.end,
      speed: rate,
      createdAt: new Date().toISOString(),
    };
    await store.upsertLoop(loop);
    setLoops((ls) => [...ls, loop].sort((a, b) => a.start - b.start));
    setActiveLoopId(loop.id);
    setLoopName('');
  };
  const updateLoopSpeed = async (l: LoopSection) => {
    const updated = { ...l, speed: rate, start: range?.start ?? l.start, end: range?.end ?? l.end };
    await store.upsertLoop(updated);
    setLoops((ls) => ls.map((x) => (x.id === l.id ? updated : x)));
    setActiveLoopId(l.id);
  };
  const removeLoop = async (l: LoopSection) => {
    if (!confirm(`‘${l.name}’ 구간을 삭제할까요?`)) return;
    await store.deleteLoop(l.id);
    setLoops((ls) => ls.filter((x) => x.id !== l.id));
    if (activeLoopId === l.id) setActiveLoopId(null);
  };

  const patchSong = async (patch: Partial<Song>) => {
    if (!song) return;
    const updated = { ...song, ...patch };
    setSong(updated);
    songRef.current = updated;
    await store.upsertSong(updated);
  };
  const removeSong = async () => {
    if (!song || !confirm(`‘${song.title}’을(를) 라이브러리에서 뺄까요?\n저장한 구간도 함께 삭제됩니다. 음원 파일은 지워지지 않아요.`)) return;
    await store.deleteSong(song.id);
    bump();
    navigate('/');
  };

  // ── 렌더 ──
  if (songQ.loading && song === null) return <div className="page"><p className="muted">불러오는 중…</p></div>;
  if (!song) {
    return (
      <div className="page">
        <div className="empty">
          <strong style={{ fontSize: 18 }}>곡을 찾을 수 없어요</strong>
          <Link to="/" className="btn light">라이브러리로</Link>
        </div>
      </div>
    );
  }

  const rangeLen = range ? range.end - range.start : 0;
  const activeLoop = loops.find((l) => l.id === activeLoopId) ?? null;

  return (
    <div className="page" style={{ gap: 24 }}>
      <header className="page-head">
        <div>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 15 }}>
            <Icon name="back" size={18} strokeWidth={2} />
            라이브러리
          </Link>
          <h1 className="title-l">{song.title}</h1>
          <div className="chips">
            {song.artist && <span className="chip">{song.artist}</span>}
            <span className="chip">{keyLabel(song.musicalKey)}</span>
            {song.bpm ? <span className="chip">{song.bpm} BPM</span> : null}
            <span className="chip">{song.tuning}</span>
          </div>
        </div>
      </header>

      {fileState === 'need-permission' && (
        <div className="banner">
          <Icon name="folder" />
          <span>음원 폴더 “{permHandle?.name}” 읽기를 허용해 주세요. 브라우저 보안상 방문할 때마다 한 번씩 필요해요.</span>
          <button type="button" className="btn sm primary" onClick={allowFolder}>
            허용
          </button>
        </div>
      )}
      {fileState === 'missing' && (
        <div className="banner">
          <Icon name="alert" />
          <span>
            음원 파일 <strong>{song.fileName}</strong>을(를) 찾지 못했어요. 폴더에서 옮겨졌거나 이름이 바뀌었을 수 있어요.
          </span>
          <label className="btn sm primary" style={{ cursor: 'pointer' }}>
            파일 직접 고르기
            <input type="file" accept="audio/*" hidden onChange={pickManually} />
          </label>
        </div>
      )}

      <section className="card lg" aria-label="파형과 반복 구간" style={{ gap: 14 }}>
        <div className="card-head">
          <span className="muted" style={{ fontSize: 13 }}>
            파형을 드래그해 반복 구간을 만드세요 · 구간 양 끝을 끌어 조절
          </span>
          {range && (
            <span className="mono" style={{ fontSize: 13, color: 'var(--accent-text)' }}>
              A {formatTime(range.start)} → B {formatTime(range.end)} · {rangeLen.toFixed(1)}초
            </span>
          )}
          {pendingStart !== null && !range && (
            <span className="mono" style={{ fontSize: 13, color: 'var(--accent-text)' }}>
              A {formatTime(pendingStart)} → B를 지정하세요 (B 키)
            </span>
          )}
        </div>
        <div ref={waveEl} className="waveform">
          {fileState === 'ok' && !ready && <p className="muted" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', margin: 0 }}>파형 그리는 중…</p>}
          {fileState === 'loading' && <p className="muted" style={{ margin: 0 }}>음원 찾는 중…</p>}
        </div>
        <div className="wave-times">
          <span>{formatTime(current)}</span>
          <span>{Math.round(rate * 100)}%</span>
          <span>{formatTime(duration)}</span>
        </div>
      </section>

      <div className="row">
        <section className="card" aria-label="재생 제어" style={{ flex: '3 1 520px', gap: 22, padding: '24px 28px' }}>
          <div className="transport">
            <button type="button" className={`icon-btn${loopOn ? ' on' : ''}`} aria-pressed={loopOn} aria-label="구간 반복 (L)" title="구간 반복 (L)" onClick={() => setLoopOn((v) => !v)} disabled={!range}>
              <Icon name="repeat" strokeWidth={2} />
            </button>
            <button type="button" className="icon-btn ghost" aria-label="처음으로 (0)" title="구간 처음으로 (0)" onClick={toStart} disabled={!ready}>
              <Icon name="prev" size={24} />
            </button>
            <button type="button" className="play-btn" aria-label={playing ? '일시정지 (Space)' : '재생 (Space)'} onClick={togglePlay} disabled={!ready}>
              <Icon name={playing ? 'pause' : 'play'} size={28} />
            </button>
            <button type="button" className="icon-btn ghost" aria-label="5초 앞으로 (→)" title="5초 앞으로 (→)" onClick={() => seekBy(5)} disabled={!ready}>
              <Icon name="next" size={24} />
            </button>
            <button type="button" className="icon-btn" aria-label="구간 해제" title="구간 해제" onClick={clearLoop} disabled={!range && pendingStart === null}>
              <Icon name="trash" size={18} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="card-head">
              <span style={{ fontWeight: 600 }}>재생 속도</span>
              <span className="muted" style={{ fontSize: 13 }}>음정은 그대로 · [ ] 키로 5%씩</span>
            </div>
            <Segmented
              label="재생 속도"
              fill
              value={SPEED_PRESETS.includes(rate) ? rate : -1}
              onChange={(v) => setRate(v)}
              options={SPEED_PRESETS.map((v) => ({ value: v, label: `${Math.round(v * 100)}%` }))}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span className="sr-only">세밀한 속도</span>
              <input type="range" min={MIN_RATE} max={MAX_RATE} step={0.01} value={rate} onChange={(e) => setRate(clampRate(Number(e.target.value)))} />
              <span className="mono" style={{ width: 52, textAlign: 'right', fontWeight: 700 }}>
                {Math.round(rate * 100)}%
              </span>
            </label>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 16, borderRadius: 16, background: 'var(--surface-2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontWeight: 600 }}>스피드 트레이너</span>
                <span className="muted" style={{ fontSize: 13 }}>
                  {trainer.enabled
                    ? `${trainer.everyLoops}번 반복마다 +${Math.round(trainer.step * 100)}% · 목표 ${Math.round(trainer.target * 100)}% · 지금 ${loopCount}회째`
                    : '구간을 반복할 때마다 조금씩 빨라져요'}
                </span>
              </div>
              <Switch label="스피드 트레이너" checked={trainer.enabled} onChange={(v) => setTrainer((t) => ({ ...t, enabled: v }))} />
            </div>
            {trainer.enabled && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                <label className="field">
                  <span>올리는 폭</span>
                  <select className="select" value={trainer.step} onChange={(e) => setTrainer((t) => ({ ...t, step: Number(e.target.value) }))}>
                    {[0.02, 0.05, 0.1].map((v) => (
                      <option key={v} value={v}>+{Math.round(v * 100)}%</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>몇 번마다</span>
                  <select className="select" value={trainer.everyLoops} onChange={(e) => setTrainer((t) => ({ ...t, everyLoops: Number(e.target.value) }))}>
                    {[1, 2, 3, 4, 8].map((v) => (
                      <option key={v} value={v}>{v}번 반복</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>목표 속도</span>
                  <select className="select" value={trainer.target} onChange={(e) => setTrainer((t) => ({ ...t, target: Number(e.target.value) }))}>
                    {[0.8, 0.9, 1, 1.1, 1.2].map((v) => (
                      <option key={v} value={v}>{Math.round(v * 100)}%</option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </div>
        </section>

        <section className="card" aria-label="저장한 구간" style={{ flex: '2 1 340px' }}>
          <div className="card-head">
            <h2 className="title-s">저장한 구간</h2>
            <span className="muted" style={{ fontSize: 13 }}>속도까지 함께 저장돼요</span>
          </div>
          {range && !activeLoop && (
            <form
              style={{ display: 'flex', gap: 8 }}
              onSubmit={(e) => {
                e.preventDefault();
                saveLoop();
              }}
            >
              <label className="sr-only" htmlFor="loop-name">구간 이름</label>
              <input id="loop-name" className="input" placeholder="예: 솔로 1절, 인트로 리프" value={loopName} onChange={(e) => setLoopName(e.target.value)} />
              <button type="submit" className="btn primary">저장</button>
            </form>
          )}
          {loops.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
              파형에서 구간을 만들고 이름을 붙여 저장하세요. 다음에 열면 마지막 구간과 속도가 그대로 돌아와요.
            </p>
          ) : (
            <div className="loop-list">
              {loops.map((l) => (
                <div key={l.id} className={`loop-item${l.id === activeLoopId ? ' active' : ''}`}>
                  <button type="button" className="load" onClick={() => loadLoop(l)} disabled={!ready}>
                    <span style={{ fontWeight: 600 }}>{l.name}</span>
                    <span className="mono muted" style={{ fontSize: 12 }}>
                      {formatTime(l.start)}–{formatTime(l.end)} · {Math.round(l.speed * 100)}%
                    </span>
                  </button>
                  {l.id === activeLoopId && Math.abs(l.speed - rate) > 0.001 && (
                    <button type="button" className="btn sm" onClick={() => updateLoopSpeed(l)} title="지금 속도로 업데이트">
                      {Math.round(rate * 100)}%로 저장
                    </button>
                  )}
                  <button type="button" className="icon-btn ghost" aria-label={`${l.name} 삭제`} onClick={() => removeLoop(l)} style={{ width: 36, height: 36 }}>
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="muted" style={{ fontSize: 12, lineHeight: 2, marginTop: 'auto' }}>
            <span className="kbd">Space</span> 재생 · <span className="kbd">A</span> <span className="kbd">B</span> 구간 지정 · <span className="kbd">L</span> 반복 ·{' '}
            <span className="kbd">←</span> <span className="kbd">→</span> 5초 · <span className="kbd">[</span> <span className="kbd">]</span> 속도
          </div>
        </section>
      </div>

      <div className="row">
        <section className="card" aria-label="곡 정보" style={{ flex: '2 1 420px' }}>
          <div className="card-head">
            <h2 className="title-s">곡 정보</h2>
            <span className="muted" style={{ fontSize: 13 }}>로컬 분석 엔진(v0.2)이 붙으면 자동으로 채워져요</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <label className="field">
              <span>제목</span>
              <input className="input" defaultValue={song.title} onBlur={(e) => e.target.value.trim() && e.target.value !== song.title && patchSong({ title: e.target.value.trim() })} />
            </label>
            <label className="field">
              <span>아티스트</span>
              <input className="input" defaultValue={song.artist} onBlur={(e) => e.target.value !== song.artist && patchSong({ artist: e.target.value.trim() })} />
            </label>
            <label className="field">
              <span>BPM</span>
              <input
                className="input"
                type="number"
                min={30}
                max={300}
                defaultValue={song.bpm ?? ''}
                onBlur={(e) => {
                  const v = e.target.value ? Math.round(Number(e.target.value)) : null;
                  if (v !== song.bpm) patchSong({ bpm: v });
                }}
              />
            </label>
            <label className="field">
              <span>키</span>
              <select className="select" value={song.musicalKey ?? ''} onChange={(e) => patchSong({ musicalKey: e.target.value || null })}>
                <option value="">미정</option>
                {KEY_OPTIONS.map((k) => (
                  <option key={k} value={k}>{keyLabel(k)}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>튜닝</span>
              <select className="select" value={song.tuning} onChange={(e) => patchSong({ tuning: e.target.value })}>
                {TUNINGS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
          </div>
          <button type="button" className="btn danger sm" style={{ alignSelf: 'flex-start' }} onClick={removeSong}>
            라이브러리에서 빼기
          </button>
        </section>

        <section className="card accent" aria-label="코드 흐름 안내" style={{ flex: '1 1 300px' }}>
          <span className="eyebrow" style={{ fontSize: 13, letterSpacing: '0.04em' }}>다음 업데이트</span>
          <h2 className="title-s">코드 흐름 · 지판 · 코드톤</h2>
          <p className="lead" style={{ fontSize: 14 }}>
            v0.2에서 내 PC의 분석 엔진이 이 곡의 박자, 키, 코드 진행을 찾아 이 자리에 보여 줘요. 구간도 마디선에 딱 맞게 붙게 됩니다.
          </p>
        </section>
      </div>
    </div>
  );
}
