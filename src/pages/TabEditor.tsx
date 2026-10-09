import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Segmented, Switch } from '../components/controls';
import { useStore } from '../lib/store/StoreProvider';
import { useAsync } from '../lib/useAsync';
import type { Lick } from '../lib/store/types';
import { TUNING_PRESETS } from '../features/tuner/pitch';
import {
  changeGrid,
  changeTuning,
  deleteMeasure,
  getNote,
  GRIDS,
  insertMeasure,
  MAX_FRET,
  measureStarts,
  setNote,
  toAscii,
  toggleTech,
  togglePM,
  type TabData,
  type Tech,
} from '../features/tab/model';
import { TabStaff, type Cursor } from '../features/tab/TabStaff';
import { TabPlayer } from '../features/tab/synth';
import { SourceLoop } from '../features/licks/SourceLoop';
import { SUGGESTED_TAGS } from '../features/licks/licks';

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const TECHS: { tech: Tech; key: string; label: string }[] = [
  { tech: 'h', key: 'H', label: '해머링' },
  { tech: 'p', key: 'P', label: '풀링' },
  { tech: 'slideUp', key: '/', label: '슬라이드↗' },
  { tech: 'slideDown', key: '\\', label: '슬라이드↘' },
  { tech: 'bend', key: 'B', label: '벤딩' },
  { tech: 'vibrato', key: 'V', label: '비브라토' },
  { tech: 'mute', key: 'X', label: '뮤트' },
  { tech: 'harmonic', key: 'N', label: '하모닉스' },
  { tech: 'tap', key: 'T', label: '태핑' },
];
const KEY_TECH: Record<string, Tech> = { h: 'h', p: 'p', '/': 'slideUp', '\\': 'slideDown', b: 'bend', v: 'vibrato', '~': 'vibrato', x: 'mute', n: 'harmonic', t: 'tap' };

type SaveState = 'saved' | 'saving' | 'error';

export function TabEditor() {
  const { lickId = '' } = useParams();
  const navigate = useNavigate();
  const { store } = useStore();
  const lickQ = useAsync(() => store.getLick(lickId), [store, lickId]);
  const songsQ = useAsync(() => store.listSongs(), [store]);

  const [lick, setLick] = useState<Lick | null>(null);
  const [cursor, setCursor] = useState<Cursor>({ m: 0, s: 0, str: 5 });
  useEffect(() => {
    if (!lickQ.data) return;
    setLick(lickQ.data);
    setCursor({ m: 0, s: 0, str: lickQ.data.tab.tuning.length - 1 });
  }, [lickQ.data]);
  const song = lick?.songId ? songsQ.data?.find((s) => s.id === lick.songId) ?? null : null;
  const analysisQ = useAsync(() => (song ? store.getAnalysis(song.id) : Promise.resolve(null)), [store, song?.id]);

  // ── 실행 취소 ── (상태 갱신 함수 안에서 기록을 쌓으면 개발 모드에서 두 번 쌓이므로 ref로 현재 값을 읽는다)
  const history = useRef<{ past: TabData[]; future: TabData[] }>({ past: [], future: [] });
  const lickRef = useRef(lick);
  lickRef.current = lick;
  const tab = lick?.tab ?? null;
  const update = useCallback((fn: (l: Lick) => Lick) => setLick((l) => (l ? { ...fn(l), updatedAt: new Date().toISOString() } : l)), []);
  const replaceTab = useCallback((next: TabData) => {
    const l = lickRef.current;
    if (!l) return;
    const updated = { ...l, tab: next, updatedAt: new Date().toISOString() };
    lickRef.current = updated;
    setLick(updated);
  }, []);
  const commit = useCallback(
    (next: TabData) => {
      const l = lickRef.current;
      if (!l || next === l.tab) return;
      history.current.past.push(l.tab);
      if (history.current.past.length > 200) history.current.past.shift();
      history.current.future = [];
      replaceTab(next);
    },
    [replaceTab],
  );
  const undo = useCallback(() => {
    const l = lickRef.current;
    const prev = history.current.past.pop();
    if (!l || !prev) return;
    history.current.future.push(l.tab);
    replaceTab(prev);
  }, [replaceTab]);
  const redo = useCallback(() => {
    const l = lickRef.current;
    const next = history.current.future.pop();
    if (!l || !next) return;
    history.current.past.push(l.tab);
    replaceTab(next);
  }, [replaceTab]);

  // ── 자동 저장 ──
  const [save, setSave] = useState<SaveState>('saved');
  const loaded = useRef<string | null>(null);
  useEffect(() => {
    if (!lick) return;
    if (loaded.current !== lick.id) {
      loaded.current = lick.id; // 처음 불러온 것은 저장하지 않음
      return;
    }
    setSave('saving');
    const t = setTimeout(() => {
      store.upsertLick(lick).then(
        () => setSave('saved'),
        () => setSave('error'),
      );
    }, 600);
    return () => clearTimeout(t);
  }, [lick, store]);

  // ── 커서 ──
  useEffect(() => {
    if (!tab) return;
    setCursor((c) => ({
      m: Math.min(c.m, tab.measures.length - 1),
      s: Math.min(c.s, tab.measures[Math.min(c.m, tab.measures.length - 1)].grid - 1),
      str: Math.min(c.str, tab.tuning.length - 1),
    }));
  }, [tab?.measures.length, tab?.tuning.length, tab]);
  const digit = useRef<{ key: string; value: number; at: number } | null>(null);

  // ── 재생 ──
  const player = useRef<TabPlayer | null>(null);
  if (!player.current) player.current = new TabPlayer();
  useEffect(() => () => player.current?.dispose(), []);
  const [playing, setPlaying] = useState(false);
  const [playPos, setPlayPos] = useState<{ m: number; s: number } | null>(null);
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState(true);
  const [click, setClick] = useState(false);
  const [drive, setDrive] = useState(true);

  const stop = useCallback(() => {
    player.current?.stop();
    setPlaying(false);
    setPlayPos(null);
  }, []);

  const play = useCallback(
    (fromStart = false) => {
      if (!tab) return;
      const starts = measureStarts(tab);
      const from = fromStart ? 0 : starts[cursor.m];
      const bar = starts[1] - starts[0];
      setPlaying(true);
      player.current!.play(tab, {
        from,
        loopFrom: from,
        loop,
        rate,
        click,
        drive,
        onPosition: (t) => {
          const m = Math.min(tab.measures.length - 1, Math.floor(t / bar + 1e-9));
          const meas = tab.measures[m];
          setPlayPos({ m, s: Math.min(meas.grid - 1, Math.floor(((t - starts[m]) / bar) * meas.grid + 1e-9)) });
        },
        onEnd: () => {
          setPlaying(false);
          setPlayPos(null);
        },
      });
    },
    [tab, cursor.m, loop, rate, click, drive],
  );
  // 재생 설정을 바꾸면 그 설정으로 다시
  const playingRef = useRef(playing);
  playingRef.current = playing;
  // (타브 내용이 바뀔 때마다 다시 시작하면 거슬리므로 재생 설정만 본다)
  const playRef = useRef(play);
  playRef.current = play;
  useEffect(() => {
    if (playingRef.current) playRef.current();
  }, [rate, loop, click, drive]);

  const previewNote = useCallback(
    (str: number, fret: number) => {
      if (tab && !playingRef.current) player.current?.preview(tab.tuning[str] + fret, drive);
    },
    [tab, drive],
  );

  // ── 편집 동작 ──
  const moveCursor = useCallback(
    (ds: number, dstr = 0, dm = 0) => {
      if (!tab) return;
      setCursor((c) => {
        let { m, s } = c;
        const str = Math.max(0, Math.min(tab.tuning.length - 1, c.str + dstr));
        if (dm) {
          m = Math.max(0, Math.min(tab.measures.length - 1, m + dm));
          s = Math.min(s, tab.measures[m].grid - 1);
        }
        s += ds;
        while (s < 0 && m > 0) {
          m -= 1;
          s += tab.measures[m].grid;
        }
        while (s >= tab.measures[m].grid && m < tab.measures.length - 1) {
          s -= tab.measures[m].grid;
          m += 1;
        }
        s = Math.max(0, Math.min(tab.measures[m].grid - 1, s));
        return { m, s, str };
      });
    },
    [tab],
  );

  const typeDigit = useCallback(
    (d: number) => {
      if (!tab) return;
      const key = `${cursor.m}-${cursor.s}-${cursor.str}`;
      const now = performance.now();
      const prev = digit.current;
      let fret = d;
      if (prev && prev.key === key && now - prev.at < 900 && prev.value * 10 + d <= MAX_FRET) fret = prev.value * 10 + d;
      digit.current = { key, value: fret, at: now };
      const old = getNote(tab, cursor.m, cursor.s, cursor.str);
      commit(setNote(tab, cursor.m, cursor.s, cursor.str, { ...old, fret }));
      previewNote(cursor.str, fret);
    },
    [tab, cursor, commit, previewNote],
  );

  const tech = useCallback((t: Tech) => tab && commit(toggleTech(tab, cursor.m, cursor.s, cursor.str, t)), [tab, cursor, commit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target instanceof HTMLElement ? e.target : document.body;
      if (el.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (!tab) return;
      const k = e.key;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && k.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && k.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (mod || e.altKey) return;
      if (/^[0-9]$/.test(k)) {
        e.preventDefault();
        typeDigit(Number(k));
      } else if (k === 'Backspace' || k === 'Delete') {
        e.preventDefault();
        commit(setNote(tab, cursor.m, cursor.s, cursor.str, null));
        digit.current = null;
      } else if (k === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) moveCursor(0, 0, -1);
        else moveCursor(-1);
      } else if (k === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey) moveCursor(0, 0, 1);
        else moveCursor(1);
      } else if (k === 'ArrowUp') {
        e.preventDefault();
        moveCursor(0, 1);
      } else if (k === 'ArrowDown') {
        e.preventDefault();
        moveCursor(0, -1);
      } else if (k === ' ') {
        if (el.closest('button')) return;
        e.preventDefault();
        if (playing) stop();
        else play();
      } else if (k === 'Escape') {
        stop();
      } else if (k.toLowerCase() === 'm') {
        commit(togglePM(tab, cursor.m, cursor.s));
      } else if (KEY_TECH[k.toLowerCase()] || KEY_TECH[k]) {
        e.preventDefault();
        tech(KEY_TECH[k.toLowerCase()] ?? KEY_TECH[k]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tab, cursor, commit, undo, redo, typeDigit, moveCursor, playing, play, stop, tech]);

  // ── 렌더 ──
  const [copied, setCopied] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const current = tab ? getNote(tab, cursor.m, cursor.s, cursor.str) : null;
  const tuningPreset = useMemo(() => TUNING_PRESETS.find((t) => t.label === tab?.tuningLabel)?.id ?? 'custom', [tab?.tuningLabel]);

  if (lickQ.loading && !lick) return <div className="page"><p className="muted">불러오는 중…</p></div>;
  if (!lick || !tab) {
    return (
      <div className="page">
        <div className="empty">
          <strong style={{ fontSize: 18 }}>릭을 찾을 수 없어요</strong>
          <Link to="/licks" className="btn light">릭 보관함으로</Link>
        </div>
      </div>
    );
  }

  const addTag = (t: string) => {
    const tag = t.trim().replace(/^#/, '');
    if (tag && !lick.tags.includes(tag)) update((l) => ({ ...l, tags: [...l.tags, tag] }));
    setTagInput('');
  };

  return (
    <div className="page" style={{ gap: 20 }}>
      <header className="page-head">
        <div style={{ flex: 1, minWidth: 260 }}>
          <Link to="/licks" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 15 }}>
            <Icon name="back" size={18} strokeWidth={2} />
            릭 보관함
          </Link>
          <label>
            <span className="sr-only">릭 이름</span>
            <input
              className="title-input"
              value={lick.title}
              onChange={(e) => update((l) => ({ ...l, title: e.target.value }))}
              onBlur={(e) => !e.target.value.trim() && update((l) => ({ ...l, title: '새 릭' }))}
            />
          </label>
          <span className="muted" style={{ fontSize: 13 }} role="status">
            {save === 'saving' ? '저장 중…' : save === 'error' ? '저장하지 못했어요 — 연결을 확인해 주세요' : '자동 저장됨'}
            {song ? ` · ${song.title}에서` : ' · 직접 적은 릭'}
          </span>
        </div>
        <div className="chips" style={{ alignItems: 'center', gap: 8 }}>
          <button type="button" className={`icon-btn${lick.favorite ? ' on' : ''}`} aria-pressed={lick.favorite} aria-label="즐겨찾기" onClick={() => update((l) => ({ ...l, favorite: !l.favorite }))}>
            <Icon name={lick.favorite ? 'starFill' : 'star'} size={18} />
          </button>
          <button
            type="button"
            className="btn sm"
            onClick={async () => {
              await navigator.clipboard.writeText(toAscii(tab));
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? '복사했어요' : '텍스트 타브 복사'}
          </button>
          <button
            type="button"
            className="btn sm danger"
            onClick={async () => {
              if (!confirm(`‘${lick.title}’ 릭을 지울까요?`)) return;
              stop();
              await store.deleteLick(lick.id);
              navigate('/licks');
            }}
          >
            삭제
          </button>
        </div>
      </header>

      {lick.source && song && <SourceLoop lick={lick} song={song} analysis={analysisQ.data ?? null} />}

      <section className="card" aria-label="타브 설정" style={{ gap: 14, padding: '16px 20px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <label className="field" style={{ width: 190 }}>
            <span>튜닝</span>
            <select
              className="select"
              value={tuningPreset}
              onChange={(e) => {
                const p = TUNING_PRESETS.find((t) => t.id === e.target.value);
                if (p) commit(changeTuning(tab, p.strings, p.label));
              }}
            >
              {TUNING_PRESETS.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </label>
          <label className="field" style={{ width: 96 }}>
            <span>BPM</span>
            <input
              className="input"
              type="number"
              min={30}
              max={300}
              key={tab.bpm}
              defaultValue={tab.bpm}
              onBlur={(e) => {
                const v = Math.round(Number(e.target.value));
                if (v >= 30 && v <= 300 && v !== tab.bpm) commit({ ...tab, bpm: v });
              }}
            />
          </label>
          <label className="field" style={{ width: 150 }}>
            <span>{cursor.m + 1}마디 칸</span>
            <select className="select" value={tab.measures[cursor.m].grid} onChange={(e) => commit(changeGrid(tab, cursor.m, Number(e.target.value)))}>
              {GRIDS.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
          </label>
          <div className="chips" style={{ gap: 6, marginLeft: 'auto' }}>
            <button type="button" className="btn sm" onClick={() => commit(insertMeasure(tab, cursor.m))}>
              <Icon name="plus" size={14} strokeWidth={2.4} /> 마디 추가
            </button>
            <button type="button" className="btn sm" onClick={() => commit(insertMeasure(tab, cursor.m, cursor.m))}>
              {cursor.m + 1}마디 복제
            </button>
            <button type="button" className="btn sm" onClick={() => commit(deleteMeasure(tab, cursor.m))}>
              {cursor.m + 1}마디 삭제
            </button>
            <button type="button" className="icon-btn" aria-label="실행 취소 (Ctrl+Z)" title="실행 취소 (Ctrl+Z)" onClick={undo} style={{ width: 36, height: 36 }}>
              <Icon name="undo" size={16} strokeWidth={2} />
            </button>
            <button type="button" className="icon-btn" aria-label="다시 실행 (Ctrl+Y)" title="다시 실행 (Ctrl+Y)" onClick={redo} style={{ width: 36, height: 36 }}>
              <Icon name="redo" size={16} strokeWidth={2} />
            </button>
          </div>
        </div>

        <div role="group" aria-label="주법" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {TECHS.map((t) => (
            <button key={t.tech} type="button" className="tag-chip" aria-pressed={!!current?.techs?.includes(t.tech)} disabled={!current} onClick={() => tech(t.tech)} title={`${t.label} (${t.key})`}>
              <span className="mono">{t.key}</span> {t.label}
            </button>
          ))}
          <button type="button" className="tag-chip" aria-pressed={tab.measures[cursor.m].pm[cursor.s]} onClick={() => commit(togglePM(tab, cursor.m, cursor.s))} title="팜뮤트 (M)">
            <span className="mono">M</span> 팜뮤트
          </button>
          {current?.techs?.includes('bend') && (
            <label className="tag-chip" style={{ cursor: 'default' }}>
              벤딩 폭
              <select
                value={current.bend ?? 2}
                onChange={(e) => commit(setNote(tab, cursor.m, cursor.s, cursor.str, { ...current, bend: Number(e.target.value) }))}
                style={{ background: 'transparent', color: 'inherit', border: 0, fontWeight: 700 }}
              >
                <option value={1}>반음</option>
                <option value={2}>온음</option>
                <option value={3}>1음 반</option>
                <option value={4}>2음</option>
              </select>
            </label>
          )}
        </div>
      </section>

      <section className="card lg" aria-label="타브" style={{ gap: 16 }}>
        <div className="card-head" style={{ alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 13 }}>
            {cursor.m + 1}마디 {cursor.s + 1}칸 · {tab.tuning.length - cursor.str}번 줄
            {current && ` · ${current.fret}프렛 ${NAMES[(tab.tuning[cursor.str] + current.fret) % 12]}`}
          </span>
          <span className="muted" style={{ fontSize: 12 }}>
            숫자 프렛 · ←→ 칸 · ↑↓ 줄 · Shift+←→ 마디 · Del 지우기 · Space 재생
          </span>
        </div>
        <TabStaff tab={tab} cursor={cursor} playing={playPos} onCellClick={setCursor} />
      </section>

      <section className="card" aria-label="타브 재생" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14 }}>
          <button type="button" className="play-btn md" aria-label={playing ? '멈춤 (Space)' : `${cursor.m + 1}마디부터 재생 (Space)`} onClick={() => (playing ? stop() : play())}>
            <Icon name={playing ? 'pause' : 'play'} size={22} />
          </button>
          <button type="button" className="btn sm" onClick={() => play(true)}>
            처음부터
          </button>
          <Segmented label="재생 속도" value={rate} onChange={setRate} options={[0.5, 0.75, 1].map((v) => ({ value: v, label: `${Math.round(v * 100)}%` }))} />
          <span className="mono muted" style={{ fontSize: 12 }}>{Math.round(tab.bpm * rate)} BPM</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            <Switch label="반복" checked={loop} onChange={setLoop} /> 반복
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            <Switch label="메트로놈" checked={click} onChange={setClick} /> 메트로놈
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            <Switch label="드라이브" checked={drive} onChange={setDrive} /> 드라이브
          </label>
        </div>
      </section>

      <div className="row">
        <section className="card" aria-label="태그와 메모" style={{ flex: '2 1 420px' }}>
          <h2 className="title-s">태그 · 메모</h2>
          <div className="chips" style={{ gap: 6 }}>
            {lick.tags.map((t) => (
              <button key={t} type="button" className="tag-chip" aria-pressed="true" onClick={() => update((l) => ({ ...l, tags: l.tags.filter((x) => x !== t) }))} title="눌러서 빼기">
                #{t} ×
              </button>
            ))}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addTag(tagInput);
              }}
              style={{ display: 'flex' }}
            >
              <label className="sr-only" htmlFor="tag-input">태그 추가</label>
              <input id="tag-input" className="input" style={{ minHeight: 30, width: 130, fontSize: 13 }} placeholder="태그 추가" value={tagInput} onChange={(e) => setTagInput(e.target.value)} />
            </form>
          </div>
          <div className="chips" style={{ gap: 6 }}>
            {SUGGESTED_TAGS.filter((t) => !lick.tags.includes(t)).map((t) => (
              <button key={t} type="button" className="tag-chip" onClick={() => addTag(t)}>
                +{t}
              </button>
            ))}
          </div>
          <label className="field">
            <span>메모</span>
            <textarea className="textarea" placeholder="운지 팁, 피킹 방향, 어디서 막히는지…" value={lick.memo} onChange={(e) => update((l) => ({ ...l, memo: e.target.value }))} />
          </label>
        </section>
        <section className="card" aria-label="목표" style={{ flex: '1 1 260px' }}>
          <h2 className="title-s">목표 BPM</h2>
          <label className="field">
            <span>원곡 템포나 목표 속도</span>
            <input
              className="input"
              type="number"
              min={30}
              max={400}
              key={lick.bpmGoal ?? 'none'}
              defaultValue={lick.bpmGoal ?? ''}
              placeholder={String(tab.bpm)}
              onBlur={(e) => update((l) => ({ ...l, bpmGoal: e.target.value ? Math.round(Number(e.target.value)) : null }))}
            />
          </label>
          <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
            복습할 때 친 BPM을 적으면 목표까지 얼마나 왔는지 보여 드려요.
          </p>
        </section>
      </div>
    </div>
  );
}
