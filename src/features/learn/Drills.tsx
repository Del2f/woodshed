import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Segmented, Switch } from '../../components/controls';
import { useStore } from '../../lib/store/StoreProvider';
import { useAsync } from '../../lib/useAsync';
import { usePracticeLog } from '../../lib/usePracticeLog';
import { NOTE_NAMES } from '../../lib/theory';
import { newLick } from '../licks/licks';
import { TabStaff } from '../tab/TabStaff';
import { measureStarts, type TabData } from '../tab/model';
import { TabPlayer } from '../tab/synth';
import type { BpmLevels } from './curriculum';
import { NoteBoard, spotKey, type BoardDot } from './NoteBoard';
import {
  INVERSIONS, MODES, ROOTS, TRIADS, bpmAfterLoop, degreeLabels, diatonicTriads, fretWindow, modeById, modeNoteNames, modeSemis,
  scaleDrillTab, sweepDrillTab, sweepShape, threeNpsPositions, type BpmStepConfig, type ModeId, type PatternNote,
} from './patterns';

const BASE_BPM = 60;
const MIN_BPM = 30;
const MAX_BPM = 300;
const clampBpm = (v: number) => Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(v)));

/** 근음을 가장 낮은 줄 옥타브에서 (드론용) */
const lowRoot = (strings: number[], pc: number) => strings[0] + ((((pc - strings[0]) % 12) + 12) % 12);

interface DrillCardProps {
  lessonId: string;
  /** 같은 패턴인지 알아보는 열쇠 — 연습 목록에 이미 있는지 확인할 때 */
  drillKey: string;
  strings: number[];
  tuningLabel: string;
  /** 지판에 그릴 음 (여러 모양이면 합쳐서) */
  notes: PatternNote[];
  tab: TabData;
  lickTitle: string;
  tags: string[];
  memo: string;
  levels: BpmLevels;
  /** 드론으로 울릴 근음 (MIDI). 없으면 드론 스위치를 숨긴다 */
  droneMidi?: number | null;
  droneDefault?: boolean;
  /** 패턴 고르는 컨트롤 (지판 위) */
  children?: ReactNode;
}

/**
 * 연습 카드: 패턴 고르기 → 지판·타브 → 듣기(메트로놈·드론·자동 BPM 올리기) → 연습 목록에 추가.
 * 연습 목록에 넣으면 릭 보관함에 들어가 복습 일정·BPM 기록이 쌓인다.
 */
export function DrillCard({ lessonId, drillKey, strings, tuningLabel, notes, tab, lickTitle, tags, memo, levels, droneMidi, droneDefault, children }: DrillCardProps) {
  const { store, version, bump } = useStore();

  // ── 지판 ──
  const win = fretWindow(notes);
  const dots = useMemo(() => {
    const m = new Map<string, BoardDot>();
    for (const n of notes) m.set(spotKey(n), { text: n.label, kind: n.root ? 'root' : 'note' });
    return m;
  }, [notes]);

  // ── 재생 ──
  const player = useRef<TabPlayer | null>(null);
  if (!player.current) player.current = new TabPlayer();
  useEffect(() => () => player.current?.dispose(), []);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState<{ m: number; s: number } | null>(null);
  const [bpm, setBpm] = useState(levels.beginner);
  const bpmRef = useRef(bpm);
  const [click, setClick] = useState(true);
  const [drive, setDrive] = useState(true);
  const [drone, setDrone] = useState(!!droneDefault);
  const [auto, setAuto] = useState<BpmStepConfig>({ enabled: false, step: 5, everyLoops: 4, target: levels.intermediate });
  const autoRef = useRef(auto);
  autoRef.current = auto;
  const loops = useRef(0);
  const { start: logStart, pause: logPause } = usePracticeLog();

  const stop = useCallback(() => {
    player.current?.stop();
    setPlaying(false);
    setPos(null);
    logPause();
  }, [logPause]);

  const start = useCallback(() => {
    const starts = measureStarts(tab);
    const bar = starts[1] - starts[0];
    loops.current = 0;
    setPlaying(true);
    logStart();
    player.current!.play(tab, {
      from: 0,
      loop: true,
      rate: bpmRef.current / tab.bpm,
      click,
      drive,
      drone: drone && droneMidi != null ? droneMidi : null,
      onPosition: (t) => {
        const m = Math.min(tab.measures.length - 1, Math.floor(t / bar + 1e-9));
        const meas = tab.measures[m];
        setPos({ m, s: Math.min(meas.grid - 1, Math.floor(((t - starts[m]) / bar) * meas.grid + 1e-9)) });
      },
      onLoop: () => {
        loops.current += 1;
        const next = bpmAfterLoop(bpmRef.current, loops.current, autoRef.current);
        if (next !== bpmRef.current) {
          bpmRef.current = next;
          setBpm(next);
        }
        return next / tab.bpm;
      },
    });
  }, [tab, click, drive, drone, droneMidi, logStart]);

  // 패턴·소리 설정이 바뀌면 재생 중일 때만 새 설정으로 다시
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const startRef = useRef(start);
  startRef.current = start;
  useEffect(() => {
    if (playingRef.current) startRef.current();
  }, [tab, click, drive, drone]);

  const changeBpm = (v: number) => {
    const next = clampBpm(v);
    bpmRef.current = next;
    setBpm(next);
    if (playingRef.current) startRef.current();
  };

  // ── 연습 목록 ──
  const licksQ = useAsync(() => store.listLicks(), [store, version]);
  const existing = licksQ.data?.find((l) => l.origin?.key === drillKey) ?? null;
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const add = async () => {
    setAdding(true);
    setError(null);
    try {
      const lick = newLick({ title: lickTitle, tuningLabel, bpm });
      lick.tab = { ...tab, bpm };
      lick.tags = tags;
      lick.memo = memo;
      lick.bpmGoal = auto.target;
      lick.origin = { lessonId, key: drillKey };
      await store.upsertLick(lick);
      bump();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  };

  const levelChips: [string, number][] = [
    ['입문', levels.beginner],
    ['중급', levels.intermediate],
    ['고급', levels.advanced],
  ];

  return (
    <div className="drill">
      {children && <div className="drill-pick">{children}</div>}

      <NoteBoard strings={strings} frets={win.count} startFret={win.start} dots={dots} label={`${lickTitle} 지판 모양`} />
      <TabStaff tab={tab} playing={pos} />

      <div className="drill-controls">
        <button type="button" className="play-btn md" aria-label={playing ? '멈춤' : '재생'} onClick={() => (playing ? stop() : start())}>
          <Icon name={playing ? 'pause' : 'play'} size={22} />
        </button>
        <div className="drill-bpm" role="group" aria-label="빠르기">
          <button type="button" className="btn sm" onClick={() => changeBpm(bpm - 5)} aria-label="5 BPM 느리게">−5</button>
          <label>
            <span className="sr-only">BPM</span>
            <input
              className="input mono"
              type="number"
              min={MIN_BPM}
              max={MAX_BPM}
              key={bpm}
              defaultValue={bpm}
              onBlur={(e) => changeBpm(Number(e.target.value) || bpm)}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          </label>
          <button type="button" className="btn sm" onClick={() => changeBpm(bpm + 5)} aria-label="5 BPM 빠르게">+5</button>
          <span className="muted" style={{ fontSize: 12 }}>BPM · {levels.unit}</span>
        </div>
        <div className="chips" style={{ gap: 6 }} role="group" aria-label="단계별 목표">
          {levelChips.map(([name, v]) => (
            <button key={name} type="button" className="tag-chip" aria-pressed={auto.target === v} onClick={() => setAuto((a) => ({ ...a, target: v }))} title={`목표를 ${v} BPM으로`}>
              {name} {v}
            </button>
          ))}
        </div>
      </div>

      <div className="drill-controls">
        <label className="drill-switch">
          <Switch label="메트로놈" checked={click} onChange={setClick} /> 메트로놈
        </label>
        <label className="drill-switch">
          <Switch label="드라이브" checked={drive} onChange={setDrive} /> 드라이브
        </label>
        {droneMidi != null && (
          <label className="drill-switch">
            <Switch label="근음 드론" checked={drone} onChange={setDrone} /> 근음 드론
          </label>
        )}
        <label className="drill-switch">
          <Switch label="자동으로 올리기" checked={auto.enabled} onChange={(v) => setAuto((a) => ({ ...a, enabled: v }))} /> 자동으로 올리기
        </label>
        {auto.enabled && (
          <span className="muted" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Segmented label="한 번에 올릴 BPM" value={auto.step} onChange={(step) => setAuto((a) => ({ ...a, step }))} options={[2, 5, 10].map((v) => ({ value: v, label: `+${v}` }))} />
            <Segmented label="몇 바퀴마다" value={auto.everyLoops} onChange={(everyLoops) => setAuto((a) => ({ ...a, everyLoops }))} options={[2, 4, 8].map((v) => ({ value: v, label: `${v}바퀴` }))} />
            목표 {auto.target} BPM{bpm >= auto.target ? ' 도착!' : ''}
          </span>
        )}
      </div>

      <div className="drill-foot">
        {existing ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 14 }}>
            <span className="chip">연습 목록에 있음</span>
            <Link to={`/tabs/${existing.id}`}>타브 열기</Link>
            <Link to="/licks">릭 보관함</Link>
          </span>
        ) : (
          <button type="button" className="btn sm" onClick={add} disabled={adding || licksQ.loading}>
            <Icon name="plus" size={16} /> 내 연습 목록에 추가
          </button>
        )}
        <span className="muted" style={{ fontSize: 12 }}>
          추가하면 내일부터 복습에 나오고, 목표 {auto.target} BPM과 친 BPM 기록이 쌓여요.
        </span>
        {error && <span role="alert" style={{ color: 'var(--red)', fontSize: 13 }}>{error}</span>}
      </div>
    </div>
  );
}

// ── 3nps 스케일·모드 ─────────────────────

export function ScaleDrill({
  lessonId, strings, tuningLabel, modes, defaultMode, defaultRoot, drone, levels,
}: {
  lessonId: string;
  strings: number[];
  tuningLabel: string;
  modes: ModeId[];
  defaultMode: ModeId;
  defaultRoot: number;
  drone?: boolean;
  levels: BpmLevels;
}) {
  const [root, setRoot] = useState(defaultRoot);
  const [mode, setMode] = useState<ModeId>(defaultMode);
  const [posIdx, setPosIdx] = useState(0);
  const [legato, setLegato] = useState(false);

  const rootName = NOTE_NAMES[root];
  const semis = useMemo(() => modeSemis(mode), [mode]);
  const positions = useMemo(() => threeNpsPositions(strings, root, semis), [strings, root, semis]);
  const notes = positions[Math.min(posIdx, positions.length - 1)];
  const tab = useMemo(() => scaleDrillTab(notes, { strings, tuningLabel, bpm: BASE_BPM, legato }), [notes, strings, tuningLabel, legato]);

  const info = modeById(mode);
  const names = modeNoteNames(rootName, mode);
  const labels = degreeLabels(semis);
  const modeName = `${rootName} ${info.name}${info.alias ? `(${info.alias})` : ''}`;
  // 메이저 스케일 레슨처럼 모드가 하나뿐이면 익숙한 이름(메이저)으로
  const shortName = modes.length === 1 && info.alias ? info.alias : info.name;
  const startLabel = notes[0].label;
  const title = `${rootName} ${shortName} 3nps 포지션 ${posIdx + 1}${legato ? ' (레가토)' : ''}`;

  return (
    <DrillCard
      lessonId={lessonId}
      drillKey={`scale:${mode}:${root}:${posIdx}:${legato ? 'legato' : 'alt'}:${tuningLabel}`}
      strings={strings}
      tuningLabel={tuningLabel}
      notes={notes}
      tab={tab}
      lickTitle={title}
      tags={['스케일', '3nps', shortName, ...(legato ? ['레가토'] : [])]}
      memo={`커리큘럼 연습: ${modeName} · 포지션 ${posIdx + 1} (가장 낮은 줄 ${startLabel}부터).\n${legato ? '줄마다 피킹 한 번 + 해머링·풀링 두 번.' : '얼터네이트 피킹: 한 줄 다운–업–다운, 다음 줄 업–다운–업.'}\n목표: 입문 ${levels.beginner} · 중급 ${levels.intermediate} · 고급 ${levels.advanced} BPM (${levels.unit})`}
      levels={levels}
      droneMidi={lowRoot(strings, root)}
      droneDefault={drone}
    >
      <div className="drill-row">
        <label className="field">
          <span>근음</span>
          <select className="select" value={root} onChange={(e) => setRoot(Number(e.target.value))}>
            {ROOTS.map((r) => (
              <option key={r.pc} value={r.pc}>{r.name}</option>
            ))}
          </select>
        </label>
        {modes.length > 1 && (
          <label className="field">
            <span>모드</span>
            <select className="select" value={mode} onChange={(e) => setMode(e.target.value as ModeId)}>
              {modes.map((id) => {
                const m = modeById(id);
                return (
                  <option key={id} value={id}>{m.name}{m.alias ? ` (${m.alias})` : ''}</option>
                );
              })}
            </select>
          </label>
        )}
        <label className="field">
          <span>피킹</span>
          <Segmented label="피킹 방식" value={legato ? 'legato' : 'alt'} onChange={(v) => setLegato(v === 'legato')} options={[{ value: 'alt', label: '얼터네이트' }, { value: 'legato', label: '레가토' }]} />
        </label>
      </div>
      <div className="field">
        <span>포지션 (지판 낮은 쪽부터)</span>
        <div className="chips" style={{ gap: 6 }} role="group" aria-label="포지션">
          {positions.map((p, i) => (
            <button key={i} type="button" className="tag-chip" aria-pressed={i === posIdx} onClick={() => setPosIdx(i)} title={`${p[0].fret}프렛, ${p[0].label}부터`}>
              {i + 1} · {p[0].fret}프렛
            </button>
          ))}
        </div>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        <b style={{ color: 'var(--text)' }}>{modeName}</b>: {names.map((n, i) => `${n}(${labels[i]})`).join(' ')} · 이 포지션은 가장 낮은 줄의 <b>{startLabel}</b>부터 시작해요.
        {modes.length > 1 && ` ${info.sound}.`}
      </p>
    </DrillCard>
  );
}

// ── 스윕 ─────────────────────────────

export function SweepDrill({
  lessonId, strings, tuningLabel, stringCount, defaultRoot, defaultKeyMode, levels,
}: {
  lessonId: string;
  strings: number[];
  tuningLabel: string;
  stringCount: 3 | 4 | 5;
  defaultRoot: number;
  defaultKeyMode: 'ionian' | 'aeolian';
  levels: BpmLevels;
}) {
  const [keyRoot, setKeyRoot] = useState(defaultRoot);
  const [keyMode, setKeyMode] = useState(defaultKeyMode);
  const [degree, setDegree] = useState(0);
  // 0·1·2 = 인버전 하나, 'all' = 셋을 지판 낮은 쪽부터 이어서
  const [inv, setInv] = useState<number | 'all'>(0);

  const chords = useMemo(() => diatonicTriads(keyRoot, NOTE_NAMES[keyRoot], keyMode), [keyRoot, keyMode]);
  const chord = chords[degree];
  const shapes = useMemo(() => {
    const all = [0, 1, 2].map((i) => sweepShape(strings, stringCount, chord.root, chord.quality, i));
    if (inv === 'all') return all.filter((s): s is PatternNote[] => !!s).sort((a, b) => a[0].fret - b[0].fret);
    const one = all[inv];
    return one ? [one] : [];
  }, [strings, stringCount, chord, inv]);
  const notes = useMemo(() => shapes.flat(), [shapes]);
  const tab = useMemo(() => (shapes.length ? sweepDrillTab(shapes, { strings, tuningLabel, bpm: BASE_BPM }) : null), [shapes, strings, tuningLabel]);

  const keyName = `${NOTE_NAMES[keyRoot]}${keyMode === 'aeolian' ? ' 마이너' : ' 메이저'}`;
  const invLabel = inv === 'all' ? '인버전 3개 이어서' : INVERSIONS[inv].label;
  const title = `${chord.name} 스윕 ${stringCount}줄 · ${invLabel}`;

  const picker = (
    <>
      <div className="drill-row">
        <label className="field">
          <span>키</span>
          <select className="select" value={keyRoot} onChange={(e) => setKeyRoot(Number(e.target.value))}>
            {ROOTS.map((r) => (
              <option key={r.pc} value={r.pc}>{r.name}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>메이저 / 마이너</span>
          <Segmented label="키 종류" value={keyMode} onChange={setKeyMode} options={[{ value: 'aeolian', label: '마이너' }, { value: 'ionian', label: '메이저' }]} />
        </label>
      </div>
      <div className="field">
        <span>{keyName} 키의 코드</span>
        <div className="chips" style={{ gap: 6 }} role="group" aria-label="코드">
          {chords.map((c, i) => (
            <button key={i} type="button" className="tag-chip" aria-pressed={i === degree} onClick={() => setDegree(i)} title={`${TRIADS[c.quality].name}`}>
              <span className="mono">{c.roman}</span> {c.name}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>인버전</span>
        <div className="chips" style={{ gap: 6 }} role="group" aria-label="인버전">
          {INVERSIONS.map((x) => (
            <button key={x.value} type="button" className="tag-chip" aria-pressed={inv === x.value} onClick={() => setInv(x.value)} title={x.hint}>
              {x.label}
            </button>
          ))}
          <button type="button" className="tag-chip" aria-pressed={inv === 'all'} onClick={() => setInv('all')} title="세 모양을 지판 낮은 쪽부터 한 마디씩">
            3개 이어서
          </button>
        </div>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        <b style={{ color: 'var(--text)' }}>{chord.name}</b> ({TRIADS[chord.quality].name}, {keyName} 키의 {chord.roman}) · {inv === 'all' ? '마디마다 다음 인버전으로 올라가요.' : INVERSIONS[inv].hint}
      </p>
    </>
  );

  if (!tab) {
    return (
      <div className="drill">
        <div className="drill-pick">{picker}</div>
        <p className="muted">이 튜닝에서는 이 모양을 개방현 없이 칠 자리가 없어요. 다른 인버전을 골라 보세요.</p>
      </div>
    );
  }

  return (
    <DrillCard
      lessonId={lessonId}
      drillKey={`sweep${stringCount}:${chord.root}:${chord.quality}:${inv}:${tuningLabel}`}
      strings={strings}
      tuningLabel={tuningLabel}
      notes={notes}
      tab={tab}
      lickTitle={title}
      tags={['스윕', '아르페지오']}
      memo={`커리큘럼 연습: ${keyName} 키의 ${chord.roman} ${chord.name}, ${invLabel}.\n올라갈 때 다운 스윕, 내려올 때 업 스윕. 맨 위 줄 두 음은 해머링·풀링.\n목표: 입문 ${levels.beginner} · 중급 ${levels.intermediate} · 고급 ${levels.advanced} BPM (${levels.unit})`}
      levels={levels}
    >
      {picker}
    </DrillCard>
  );
}

// ── 모드 비교표 ───────────────────────

export function ModeTable() {
  const [root, setRoot] = useState(4);
  const rootName = NOTE_NAMES[root];
  const rows = [...MODES].sort((a, b) => a.brightness - b.brightness);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label className="field" style={{ maxWidth: 160 }}>
        <span>근음</span>
        <select className="select" value={root} onChange={(e) => setRoot(Number(e.target.value))}>
          {ROOTS.map((r) => (
            <option key={r.pc} value={r.pc}>{r.name}</option>
          ))}
        </select>
      </label>
      <div className="mode-table" role="table" aria-label={`${rootName} 근음의 7개 모드`}>
        {rows.map((m) => {
          const semis = modeSemis(m.id);
          const labels = degreeLabels(semis);
          const names = modeNoteNames(rootName, m.id);
          return (
            <div key={m.id} className="mode-row" role="row">
              <div role="cell" className="mode-name">
                <b>{rootName} {m.name}</b>
                {m.alias && <span className="muted"> {m.alias}</span>}
              </div>
              <div role="cell" className="mode-degrees mono">
                {labels.map((l, i) => (
                  <span key={i} className={semis[i] === m.color ? 'color' : undefined} title={names[i]}>
                    {l}
                    <small>{names[i]}</small>
                  </span>
                ))}
              </div>
              <div role="cell" className="mode-desc">
                <span>{m.sound}</span>
                <span className="muted">메탈: {m.metal}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
