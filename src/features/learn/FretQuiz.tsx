import { useEffect, useRef, useState } from 'react';
import { Segmented, Switch } from '../../components/controls';
import { pcName } from '../../lib/theory';
import { useStore } from '../../lib/store/StoreProvider';
import type { QuizResult } from '../../lib/store/types';
import { useAsync } from '../../lib/useAsync';
import { TabPlayer } from '../tab/synth';
import { NoteBoard, spotKey, type BoardDot } from './NoteBoard';
import {
  checkFind, checkName, makeRound, midiAt, NATURAL_PCS, PC_LABELS, pcAt, positionsOf, retryRound, scopeLabel, scopeStrings,
  stringNumber, summarize, type Answer, type Question, type QuizSettings, type Spot,
} from './fretNotes';
import { bestOf, buildResult, comparable, FRET_LESSON_ID, itemLabel, settingsLabel, weakSpots } from './quizLog';

const PREF_KEY = 'woodshed.learn.quiz';
const ROUND = 10;
const DEFAULTS: QuizSettings & { sound: boolean } = { mode: 'name', scope: 'low2', naturalsOnly: true, maxFret: 12, sound: true };
const LETTER_PC: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

function loadPrefs(): typeof DEFAULTS {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
}

const spotText = (strings: number[], s: Spot) => `${stringNumber(strings, s.si)}번 줄 ${s.fret === 0 ? '개방' : `${s.fret}프렛`}`;
const sec = (ms: number) => `${(ms / 1000).toFixed(1)}초`;
const score = (r: QuizResult) => `${r.correct}/${r.total} · ${sec(r.avgMs)}`;
const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const settingsOf = ({ mode, scope, naturalsOnly, maxFret }: QuizSettings): QuizResult['settings'] => ({ mode, scope, naturalsOnly, maxFret });

/** 지판 음 이름 퀴즈: 자리 보고 이름 맞히기 / 이름 보고 자리 찾기, 한 판 10문제 */
export function FretQuiz({ strings, tuningLabel }: { strings: number[]; tuningLabel: string }) {
  const { store } = useStore();
  const [histTick, setHistTick] = useState(0);
  const histQ = useAsync(() => store.listQuizResults(FRET_LESSON_ID), [store, histTick]);

  const [prefs, setPrefs] = useState(loadPrefs);
  useEffect(() => {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
    } catch {
      /* 무시 */
    }
  }, [prefs]);

  const [round, setRound] = useState<Question[] | null>(null);
  /** 이번 판이 '틀린 것만 다시'인지 — 기록 비교에서 뺀다 */
  const [retrying, setRetrying] = useState(false);
  /** 끝난 판의 저장 상태. before = 저장 전의 같은 설정 기록 (지난번·최고와 비교용) */
  const [saved, setSaved] = useState<{ result: QuizResult; before: QuizResult[]; state: 'saving' | 'saved' | 'error'; error?: string } | null>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [feedback, setFeedback] = useState<{ ok: boolean; pc?: number; spot?: Spot } | null>(null);
  const t0 = useRef(0);
  const advance = useRef<number | null>(null);

  const player = useRef<TabPlayer | null>(null);
  useEffect(() => () => {
    player.current?.dispose();
    if (advance.current) clearTimeout(advance.current);
  }, []);
  const sound = (midi: number) => {
    if (!prefs.sound) return;
    if (!player.current) player.current = new TabPlayer();
    void player.current.preview(midi, false);
  };

  // 튜닝이 바뀌면 진행 중인 판은 의미가 없어진다
  useEffect(() => setRound(null), [strings.join(',')]);
  useEffect(() => {
    t0.current = performance.now();
  }, [idx, round]);

  const q = round?.[idx] ?? null;
  const done = !!round && idx >= round.length;

  const start = (qs: Question[], retry = false) => {
    if (advance.current) clearTimeout(advance.current);
    setRound(qs);
    setRetrying(retry);
    setSaved(null);
    setIdx(0);
    setAnswers([]);
    setFeedback(null);
  };
  const next = () => {
    if (advance.current) clearTimeout(advance.current);
    advance.current = null;
    setFeedback(null);
    setIdx((i) => i + 1);
  };

  const submit = (ok: boolean, fb: { pc?: number; spot?: Spot }) => {
    if (!q || feedback) return;
    setAnswers((a) => [...a, { q, ok, ms: performance.now() - t0.current }]);
    setFeedback({ ok, ...fb });
    sound(midiAt(strings, ok && fb.spot ? fb.spot : q.spot));
    if (ok) advance.current = window.setTimeout(next, 750);
  };
  const answerName = (pc: number) => q && submit(checkName(q, pc), { pc });
  const answerSpot = (s: Spot) => q && submit(checkFind(strings, q, s), { spot: s });

  // 한 판이 끝나면 한 번 저장 (그만하기로 멈춘 판은 저장하지 않는다)
  useEffect(() => {
    if (!done || saved) return;
    const result = buildResult({ strings, tuningLabel, settings: prefs, retry: retrying, answers });
    const before = comparable(histQ.data ?? [], tuningLabel, result.settings);
    setSaved({ result, before, state: 'saving' });
    store.addQuizResult(result).then(
      () => {
        setSaved((x) => (x?.result === result ? { ...x, state: 'saved' } : x));
        setHistTick((t) => t + 1);
      },
      (e: unknown) => setSaved((x) => (x?.result === result ? { ...x, state: 'error', error: e instanceof Error ? e.message : String(e) } : x)),
    );
  }, [done, saved]);

  useEffect(() => {
    if (!q) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // 포커스된 단추(다음 등)는 Enter·Space를 스스로 처리한다 — 두 번 넘어가지 않게
      if (el?.tagName === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return;
      if (feedback && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        next();
      } else if (!feedback && q.mode === 'name' && LETTER_PC[e.key.toLowerCase()] !== undefined) {
        answerName(LETTER_PC[e.key.toLowerCase()]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ── 설정 ───────────────────
  if (!round) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div className="quiz-settings">
          <div className="field">
            <span>문제</span>
            <Segmented
              label="문제 종류"
              value={prefs.mode}
              onChange={(mode) => setPrefs({ ...prefs, mode })}
              options={[{ value: 'name', label: '자리 → 이름' }, { value: 'find', label: '이름 → 자리' }]}
            />
          </div>
          <div className="field">
            <span>줄</span>
            <Segmented
              label="줄 범위"
              value={prefs.scope}
              onChange={(scope) => setPrefs({ ...prefs, scope })}
              options={(['low1', 'low2', 'all'] as const).map((v) => ({ value: v, label: scopeLabel(strings, v) }))}
            />
          </div>
          <div className="field">
            <span>프렛</span>
            <Segmented
              label="프렛 범위"
              value={prefs.maxFret}
              onChange={(maxFret) => setPrefs({ ...prefs, maxFret })}
              options={[{ value: 5, label: '개방–5' }, { value: 12, label: '개방–12' }]}
            />
          </div>
        </div>
        <div className="chips" style={{ gap: 24, alignItems: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
            <Switch label="자연음만" checked={prefs.naturalsOnly} onChange={(naturalsOnly) => setPrefs({ ...prefs, naturalsOnly })} />
            자연음만 (C D E F G A B)
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
            <Switch label="소리" checked={prefs.sound} onChange={(s) => setPrefs({ ...prefs, sound: s })} />
            답하면 소리로 들려주기
          </span>
        </div>
        <button type="button" className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={() => start(makeRound(strings, prefs, ROUND))}>
          {ROUND}문제 시작
        </button>
        <QuizHistory results={histQ.data ?? null} error={histQ.error} tuningLabel={tuningLabel} settings={settingsOf(prefs)} cloud={store.kind === 'supabase'} />
      </div>
    );
  }

  // ── 결과 ───────────────────
  if (done) {
    const s = summarize(answers);
    const prev = saved?.before[0] ?? null;
    const best = saved ? bestOf(saved.before) : null;
    const newBest = !!saved && !retrying && !!best && bestOf([best, saved.result]) === saved.result;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div className="chips" style={{ gap: 32, alignItems: 'baseline' }}>
          <div>
            <div className="big-number">{s.correct} / {s.total}</div>
            <div className="muted" style={{ fontSize: 13 }}>맞힘</div>
          </div>
          <div>
            <div className="big-number">{(s.avgMs / 1000).toFixed(1)}초</div>
            <div className="muted" style={{ fontSize: 13 }}>평균 답한 시간</div>
          </div>
          {!retrying && (prev || best) && (
            <div className="quiz-compare">
              {newBest && <b style={{ color: 'var(--green)' }}>새 최고 기록!</b>}
              {prev && <span>지난번 {score(prev)}</span>}
              {best && !newBest && <span>이 설정 최고 {score(best)}</span>}
            </div>
          )}
        </div>
        <p className="lead" style={{ fontSize: 15 }}>
          {s.correct === s.total
            ? s.avgMs < 2500 ? '전부 맞혔고 빨라요. 줄 범위를 넓히거나 자연음만을 꺼 보세요.' : '전부 맞혔어요. 이제 생각하지 않고 바로 떠오를 때까지 속도를 올려 봐요.'
            : '틀린 자리만 다시 풀면서 그 자리를 지판에서 한 번 짚어 보세요.'}
        </p>
        {s.missed.length > 0 && (
          <div className="chips">
            {s.missed.map((m, i) => (
              <span key={i} className="chip">
                {spotText(strings, m.spot)} = <b>{pcName(m.pc)}</b>
              </span>
            ))}
          </div>
        )}
        <SaveStatus saved={saved} cloud={store.kind === 'supabase'} />
        <div className="chips">
          {s.missed.length > 0 && (
            <button type="button" className="btn primary" onClick={() => start(retryRound(s.missed), true)}>
              틀린 것만 다시
            </button>
          )}
          <button type="button" className={`btn${s.missed.length ? '' : ' primary'}`} onClick={() => start(makeRound(strings, prefs, ROUND))}>
            새 문제 {ROUND}개
          </button>
          <button type="button" className="btn" onClick={() => setRound(null)}>
            설정 바꾸기
          </button>
        </div>
      </div>
    );
  }

  // ── 문제 ───────────────────
  const cur = q!;
  const inScope = new Set(scopeStrings(strings, prefs.scope));
  const dots = new Map<string, BoardDot>();
  let dim: Set<number>;
  if (cur.mode === 'name') {
    dim = new Set(strings.map((_, si) => si).filter((si) => !inScope.has(si)));
    dots.set(spotKey(cur.spot), feedback ? { text: pcName(cur.pc), kind: feedback.ok ? 'good' : 'bad' } : { text: '?', kind: 'ask' });
  } else {
    dim = new Set(strings.map((_, si) => si).filter((si) => si !== cur.spot.si));
    if (feedback) {
      if (!feedback.ok) for (const s of positionsOf(strings, cur.pc, prefs.maxFret, [cur.spot.si])) dots.set(spotKey(s), { text: pcName(cur.pc), kind: 'good' });
      if (feedback.spot) dots.set(spotKey(feedback.spot), { text: pcName(pcAt(strings, feedback.spot)), kind: feedback.ok ? 'good' : 'bad' });
    }
  }
  const pads = prefs.naturalsOnly ? NATURAL_PCS : PC_LABELS.map((_, pc) => pc);
  const correctSoFar = answers.filter((a) => a.ok).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card-head" style={{ alignItems: 'center' }}>
        <span className="muted" style={{ fontSize: 14 }}>
          {idx + 1} / {round.length} · 맞힘 {correctSoFar}
        </span>
        <button type="button" className="btn sm" onClick={() => setRound(null)}>
          그만하기
        </button>
      </div>
      <div className="progress" aria-hidden>
        <span style={{ width: `${(idx / round.length) * 100}%`, background: 'var(--accent)' }} />
      </div>

      <div className="quiz-prompt" aria-live="polite">
        {cur.mode === 'name' ? (
          <>주황 자리의 음 이름은? <span className="muted">({spotText(strings, cur.spot)})</span></>
        ) : (
          <>
            <b>{stringNumber(strings, cur.spot.si)}번 줄</b>에서 <b className="quiz-note">{PC_LABELS[cur.pc].alt ? `${PC_LABELS[cur.pc].main}/${PC_LABELS[cur.pc].alt}` : PC_LABELS[cur.pc].main}</b>를 찾으세요
          </>
        )}
      </div>

      <NoteBoard
        strings={strings}
        frets={prefs.maxFret}
        dots={dots}
        dimStrings={dim}
        label={cur.mode === 'name' ? '퀴즈 지판' : `${stringNumber(strings, cur.spot.si)}번 줄에서 자리를 고르세요`}
        onPick={cur.mode === 'find' ? answerSpot : undefined}
        canPick={(s) => !feedback && s.si === cur.spot.si}
      />

      {cur.mode === 'name' && (
        <div className="note-pad" role="group" aria-label="음 이름">
          {pads.map((pc) => {
            const l = PC_LABELS[pc];
            const state = feedback ? (pc === cur.pc ? ' good' : pc === feedback.pc ? ' bad' : '') : '';
            return (
              <button key={pc} type="button" className={`note-key${l.alt ? ' sharp' : ''}${state}`} disabled={!!feedback} onClick={() => answerName(pc)}>
                {l.main}
                {l.alt && <small>{l.alt}</small>}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        {feedback && !feedback.ok && (
          <>
            <span style={{ color: 'var(--red)', fontWeight: 600 }}>
              {cur.mode === 'name'
                ? `정답은 ${pcName(cur.pc)}`
                : `${spotText(strings, feedback.spot!)}은 ${pcName(pcAt(strings, feedback.spot!))} — ${pcName(cur.pc)}는 초록 자리`}
            </span>
            <button type="button" className="btn sm light" autoFocus onClick={next}>
              다음 <span className="kbd">Enter</span>
            </button>
          </>
        )}
        {feedback?.ok && <span style={{ color: 'var(--green)', fontWeight: 600 }}>맞아요</span>}
        {!feedback && cur.mode === 'name' && (
          <span className="muted" style={{ fontSize: 13 }}>
            키보드 <span className="kbd">C</span> <span className="kbd">D</span> <span className="kbd">E</span> <span className="kbd">F</span>{' '}
            <span className="kbd">G</span> <span className="kbd">A</span> <span className="kbd">B</span>로도 답할 수 있어요
          </span>
        )}
      </div>
    </div>
  );
}

function SaveStatus({ saved, cloud }: { saved: { state: 'saving' | 'saved' | 'error'; error?: string } | null; cloud: boolean }) {
  if (!saved) return null;
  if (saved.state === 'error') {
    return (
      <div className="banner error">
        <span>
          기록을 저장하지 못했어요 ({saved.error}).
          {cloud && ' Supabase SQL Editor에서 supabase/migrations/0004_quiz_results.sql을 실행했는지 확인해 주세요.'}
        </span>
      </div>
    );
  }
  return (
    <span className="muted" style={{ fontSize: 13 }}>
      {saved.state === 'saving' ? '기록 저장 중…' : cloud ? '기록을 클라우드에 저장했어요' : '기록을 이 브라우저에 저장했어요 (설정에서 로그인하면 클라우드로 옮길 수 있어요)'}
    </span>
  );
}

/** 지난 기록: 지금 설정의 최고 기록, 자주 틀린 자리, 최근 판들 */
function QuizHistory({
  results,
  error,
  tuningLabel,
  settings,
  cloud,
}: {
  results: QuizResult[] | null;
  error: Error | null;
  tuningLabel: string;
  settings: QuizResult['settings'];
  cloud: boolean;
}) {
  if (error) {
    return (
      <div className="banner error">
        <span>
          지난 기록을 불러오지 못했어요 ({error.message}).
          {cloud && ' Supabase SQL Editor에서 supabase/migrations/0004_quiz_results.sql을 실행했는지 확인해 주세요.'}
        </span>
      </div>
    );
  }
  if (!results?.length) return null;
  const same = comparable(results, tuningLabel, settings);
  const best = bestOf(same);
  const weak = weakSpots(same.slice(0, 20));
  return (
    <div className="quiz-history">
      <h3 className="title-s" style={{ fontSize: 16 }}>지난 기록</h3>
      <div className="quiz-history-top">
        <div>
          <div className="muted" style={{ fontSize: 13 }}>이 설정({tuningLabel}) 최고</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{best ? score(best) : '아직 없음'}</div>
          {best && <div className="muted" style={{ fontSize: 12 }}>{when(best.finishedAt)} · {same.length}판</div>}
        </div>
        {weak.length > 0 && (
          <div style={{ flex: '1 1 260px' }}>
            <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>자주 틀린 자리 (최근 20판)</div>
            <div className="chips" style={{ gap: 6 }}>
              {weak.map((w) => (
                <span key={w.key} className="chip">
                  {itemLabel(w.key)} <span className="muted">{w.misses}/{w.tries}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      <div>
        {results.slice(0, 6).map((r) => (
          <div key={r.id} className="file-row" style={{ fontSize: 14 }}>
            <span className="name">
              {settingsLabel(r.settings)}
              {r.tuningLabel !== tuningLabel && <span className="muted"> · {r.tuningLabel}</span>}
              {r.retry && <span className="muted"> · 틀린 것만</span>}
            </span>
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{score(r)}</span>
            <span className="muted" style={{ fontSize: 12, minWidth: 92, textAlign: 'right' }}>{when(r.finishedAt)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
