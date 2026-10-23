import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Switch } from '../../components/controls';
import { useStore } from '../../lib/store/StoreProvider';
import { useAsync } from '../../lib/useAsync';
import { pcName } from '../../lib/theory';
import { tuningFor } from '../licks/licks';
import { FretQuiz } from './FretQuiz';
import { NoteBoard, spotKey, type BoardDot } from './NoteBoard';
import { isNatural, octaveChain, octaveShifts, pcAt, positionsOf, songRoots, stringNumber, type Spot } from './fretNotes';

const LANDMARKS = [3, 5, 7, 8, 10, 12];

const shiftText = (n: number) => (n === 0 ? '같은 프렛' : n > 0 ? `${n}칸 오른쪽` : `${-n}칸 왼쪽`);

/** 레슨 1: 지판 음 이름 */
export function FretNotesLesson({ strings, tuningLabel }: { strings: number[]; tuningLabel: string }) {
  const low = [0, 1];
  const lowLabel = low.map((si) => stringNumber(strings, si)).join('·');

  // ── 1. 한 줄 위의 12음 ─────
  const oneString = useMemo(() => {
    const m = new Map<string, BoardDot>();
    for (let fret = 0; fret <= 12; fret++) {
      const pc = pcAt(strings, { si: 0, fret });
      // E–F, B–C: 빈 칸 없이 붙은 자연음 쌍을 강조
      const tight = pc === 4 || pc === 5 || pc === 11 || pc === 0;
      m.set(spotKey({ si: 0, fret }), { text: pcName(pc), kind: isNatural(pc) ? (tight ? 'ring' : 'note') : 'faint' });
    }
    return m;
  }, [strings]);

  // ── 3. 낮은 두 줄 ─────
  const [showSharps, setShowSharps] = useState(false);
  const lowDots = useMemo(() => {
    const m = new Map<string, BoardDot>();
    for (const si of low) {
      for (let fret = 0; fret <= 12; fret++) {
        const pc = pcAt(strings, { si, fret });
        if (isNatural(pc)) m.set(spotKey({ si, fret }), { text: pcName(pc), kind: fret === 0 || fret === 12 ? 'root' : 'note' });
        else if (showSharps) m.set(spotKey({ si, fret }), { text: pcName(pc), kind: 'faint' });
      }
    }
    return m;
  }, [strings, showSharps]);

  // ── 4. 옥타브 모양 ─────
  const [picked, setPicked] = useState<Spot>({ si: 0, fret: 3 });
  useEffect(() => setPicked({ si: 0, fret: 3 }), [strings.join(',')]);
  const octDots = useMemo(() => {
    const m = new Map<string, BoardDot>();
    const pc = pcAt(strings, picked);
    for (const s of positionsOf(strings, pc, 15)) m.set(spotKey(s), { text: pcName(pc), kind: 'faint' });
    for (const s of octaveChain(strings, picked, 15)) m.set(spotKey(s), { text: pcName(pc), kind: 'ring' });
    m.set(spotKey(picked), { text: pcName(pc), kind: 'root' });
    return m;
  }, [strings, picked]);
  const shifts = octaveShifts(strings);

  return (
    <>
      <section className="card lg lesson-section">
        <h2 className="title-s">1. 음 이름은 12개뿐</h2>
        <p>
          알파벳 7개 <b>C D E F G A B</b>가 자연음이에요. 지판 한 칸이 <b>반음</b>이고, 자연음 사이에는 보통 한 칸이 비어 있어서 그 칸은
          샵(#)이나 플랫(b)으로 불러요 — 예를 들어 F와 G 사이의 칸은 F# 또는 Gb. 딱 두 곳, <b>E–F</b>와 <b>B–C</b> 사이에만 빈 칸이 없어요.
        </p>
        <NoteBoard strings={strings} frets={12} rows={[0]} dots={oneString} label={`${stringNumber(strings, 0)}번 줄 개방부터 12프렛까지의 음 이름`} />
        <p className="muted">
          주황 테두리가 빈 칸 없이 붙어 있는 E–F, B–C예요. 이 두 곳만 기억하면 어느 줄이든 개방현 이름에서 한 칸씩 세어 갈 수 있어요.
        </p>
      </section>

      <section className="card lg lesson-section">
        <h2 className="title-s">2. 개방현과 12프렛</h2>
        <div className="chips">
          {strings.map((_, si) => si).reverse().map((si) => (
            <span key={si} className="chip">
              {stringNumber(strings, si)}번 줄 <b>{pcName(strings[si])}</b>
            </span>
          ))}
        </div>
        <p>
          12프렛에서 개방현과 같은 음이 한 옥타브 위로 다시 시작해요(그래서 12프렛에만 점이 두 개). 개방부터 11프렛까지만 알면 지판 전체를 아는 셈이에요.
          다른 튜닝도 원리는 같고, 개방현 이름만 바뀌어요.
        </p>
      </section>

      <section className="card lg lesson-section">
        <div className="card-head" style={{ alignItems: 'center' }}>
          <h2 className="title-s">3. {lowLabel}번 줄부터</h2>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
            <Switch label="샵·플랫도 보기" checked={showSharps} onChange={setShowSharps} />
            샵·플랫도 보기
          </span>
        </div>
        <p>
          파워코드의 근음과 리프 대부분이 가장 낮은 두 줄에 있어요. 이 두 줄의 자연음만 확실히 알면 &lsquo;이 리프는 G5–A5–C5&rsquo;처럼 바로 읽을 수 있어요.
        </p>
        <NoteBoard strings={strings} frets={12} rows={low} dots={lowDots} label={`${lowLabel}번 줄의 자연음`} />
        <ul className="lesson-list">
          {low.map((si) => (
            <li key={si}>
              <b>{stringNumber(strings, si)}번 줄</b> 기준 자리:{' '}
              {LANDMARKS.map((f) => `${f}프렛 ${pcName(pcAt(strings, { si, fret: f }))}`).join(' · ')}
            </li>
          ))}
        </ul>
      </section>

      <section className="card lg lesson-section">
        <h2 className="title-s">4. 같은 음은 지판 곳곳에 — 옥타브 모양</h2>
        <p>
          한 자리를 알면 손 모양으로 같은 음을 넓혀 갈 수 있어요. <b>두 줄 위, 몇 칸 오른쪽</b>에 한 옥타브 위의 같은 음이 있어요. 지판에서 아무 칸이나 눌러 보세요.
        </p>
        <NoteBoard strings={strings} frets={15} dots={octDots} onPick={setPicked} label="칸을 누르면 같은 음과 옥타브 모양을 보여 줘요" />
        <ul className="lesson-list">
          {shifts.map((s) => (
            <li key={s.from}>
              {s.from}번 줄 → {s.to}번 줄: <b>{shiftText(s.shift)}</b>
            </li>
          ))}
        </ul>
        <p className="muted">
          주황 테두리가 누른 자리에서 옥타브 모양으로 이어지는 자리, 흐린 글자는 같은 이름의 나머지 자리예요. 3번 줄과 2번 줄 사이만 간격이 한 칸 좁아서, 이 경계를 넘을 때 한 칸 더 밀려요.
        </p>
      </section>

      <MySongs />

      <section className="card lg lesson-section" aria-label="퀴즈">
        <h2 className="title-s">퀴즈</h2>
        <p className="muted">하루 몇 판씩, 정답률보다 &lsquo;생각 없이 바로 떠오르는 속도&rsquo;를 목표로 해요. 평균 2초 안쪽이면 손에 붙은 거예요.</p>
        <FretQuiz strings={strings} tuningLabel={tuningLabel} />
      </section>
    </>
  );
}

/** 내 라이브러리 곡의 근음을 그 곡의 튜닝으로 낮은 두 줄에서 찾아보기 */
function MySongs() {
  const { store } = useStore();
  const songsQ = useAsync(() => store.listSongs(), [store]);
  const songs = useMemo(
    () => [...(songsQ.data ?? [])].sort((a, b) => (b.lastPracticedAt ?? b.createdAt).localeCompare(a.lastPracticedAt ?? a.createdAt)),
    [songsQ.data],
  );
  const [songId, setSongId] = useState<string | null>(null);
  const song = songs.find((s) => s.id === songId) ?? songs[0] ?? null;
  const analysisQ = useAsync(() => (song ? store.getAnalysis(song.id) : Promise.resolve(null)), [store, song?.id]);
  const roots = useMemo(() => songRoots(analysisQ.data ?? null, song?.musicalKey ?? null), [analysisQ.data, song?.musicalKey]);
  const [rootPc, setRootPc] = useState<number | null>(null);
  const root = roots.find((r) => r.pc === rootPc) ?? roots[0] ?? null;

  if (!songs.length) return null;

  const tuning = tuningFor(song!.tuning);
  const s = tuning.strings;
  const low = [0, 1];
  const dots = new Map<string, BoardDot>();
  if (root) for (const p of positionsOf(s, root.pc, 12, low)) dots.set(spotKey(p), { text: pcName(root.pc), kind: 'root' });

  return (
    <section className="card lg lesson-section">
      <div className="card-head" style={{ alignItems: 'center' }}>
        <h2 className="title-s">내 곡에서 근음 찾기</h2>
        <select className="select" style={{ width: 'auto', maxWidth: 320 }} value={song!.id} aria-label="곡" onChange={(e) => { setSongId(e.target.value); setRootPc(null); }}>
          {songs.map((x) => (
            <option key={x.id} value={x.id}>
              {x.artist ? `${x.artist} — ${x.title}` : x.title}
            </option>
          ))}
        </select>
      </div>
      {analysisQ.loading ? (
        <p className="muted">불러오는 중…</p>
      ) : !roots.length ? (
        <p className="muted">
          이 곡은 아직 분석하지 않았고 키도 적혀 있지 않아요. <Link to={`/player/${song!.id}`}>플레이어</Link>에서 분석하면 여기서 많이 나오는 근음을 볼 수 있어요.
        </p>
      ) : (
        <>
          <p>
            {song!.title}({tuning.label})에서 {analysisQ.data ? '오래 울리는 코드의 근음 순서' : '곡 키의 으뜸음'}예요. 근음을 누르고 {stringNumber(s, 0)}·{stringNumber(s, 1)}번 줄에서 자리를 확인한 뒤, 그 자리에서 파워코드로 잡아 보세요.
          </p>
          <div className="chips">
            {roots.map((r) => (
              <button key={r.pc} type="button" className="tag-chip" aria-pressed={r.pc === root?.pc} onClick={() => setRootPc(r.pc)}>
                {r.name}
                {r.chords.length > 0 && <span className="muted" style={{ fontWeight: 400 }}> ({r.chords.join(', ')})</span>}
              </button>
            ))}
          </div>
          <NoteBoard strings={s} frets={12} rows={low} dots={dots} label={`${root?.name ?? ''} 자리`} />
          <Link to={`/player/${song!.id}`} className="btn sm" style={{ alignSelf: 'flex-start' }}>
            플레이어에서 열기
          </Link>
        </>
      )}
    </section>
  );
}
