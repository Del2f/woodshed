import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Segmented } from '../components/controls';
import { useStore } from '../lib/store/StoreProvider';
import { useAsync } from '../lib/useAsync';
import type { Lick } from '../lib/store/types';
import { TabStaff } from '../features/tab/TabStaff';
import { measureStarts } from '../features/tab/model';
import { TabPlayer } from '../features/tab/synth';
import { SourceLoop } from '../features/licks/SourceLoop';
import { bestBpm, dueLicks } from '../features/licks/licks';
import { dueLabel, RATINGS, schedule, type Rating } from '../features/licks/srs';

/** 오늘 복습할 릭을 하나씩: 듣고 → 쳐 보고 → 얼마나 기억났는지 고르면 다음 복습일이 정해진다 */
export function Review() {
  const { store, bump } = useStore();
  const licksQ = useAsync(() => store.listLicks(), [store]);
  const songsQ = useAsync(() => store.listSongs(), [store]);
  // 시작할 때의 목록으로 고정 — 평가하면서 목록이 바뀌어도 순서가 흔들리지 않게
  const [queue, setQueue] = useState<Lick[] | null>(null);
  useEffect(() => {
    if (licksQ.data && !queue) setQueue(dueLicks(licksQ.data));
  }, [licksQ.data, queue]);
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState<{ title: string; next: string }[]>([]);
  const [bpm, setBpm] = useState('');

  const lick = queue?.[index] ?? null;
  const song = lick?.songId ? songsQ.data?.find((s) => s.id === lick.songId) ?? null : null;
  const analysisQ = useAsync(() => (song ? store.getAnalysis(song.id) : Promise.resolve(null)), [store, song?.id]);

  const player = useRef<TabPlayer | null>(null);
  if (!player.current) player.current = new TabPlayer();
  useEffect(() => () => player.current?.dispose(), []);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [pos, setPos] = useState<{ m: number; s: number } | null>(null);

  useEffect(() => {
    player.current?.stop();
    setPlaying(false);
    setPos(null);
    setBpm('');
  }, [lick?.id]);

  const toggle = () => {
    if (!lick) return;
    if (playing) {
      player.current!.stop();
      setPlaying(false);
      setPos(null);
      return;
    }
    const tab = lick.tab;
    const starts = measureStarts(tab);
    const bar = starts[1] - starts[0];
    setPlaying(true);
    player.current!.play(tab, {
      from: 0,
      loop: true,
      rate,
      click: true,
      drive: true,
      onPosition: (t) => {
        const m = Math.min(tab.measures.length - 1, Math.floor(t / bar + 1e-9));
        setPos({ m, s: Math.min(tab.measures[m].grid - 1, Math.floor(((t - starts[m]) / bar) * tab.measures[m].grid + 1e-9)) });
      },
    });
  };

  const rate_ = async (r: Rating) => {
    if (!lick) return;
    const now = new Date();
    const played = Math.round(Number(bpm));
    const next: Lick = {
      ...lick,
      srs: schedule(lick.srs, r, now),
      bpmLog: played >= 30 && played <= 400 ? [...lick.bpmLog, { at: now.toISOString(), bpm: played }] : lick.bpmLog,
      updatedAt: now.toISOString(),
    };
    await store.upsertLick(next);
    setDone((d) => [...d, { title: lick.title, next: dueLabel(next.srs, now) }]);
    setIndex((i) => i + 1);
    bump();
  };

  if (!queue) return <div className="page"><p className="muted">불러오는 중…</p></div>;

  if (!lick) {
    return (
      <div className="page" style={{ maxWidth: 720 }}>
        <header className="page-head">
          <div>
            <span className="eyebrow">복습</span>
            <h1 className="title-xl">{done.length ? '오늘 복습 끝!' : '오늘은 복습할 릭이 없어요'}</h1>
          </div>
        </header>
        {done.length > 0 && (
          <section className="card">
            {done.map((d, i) => (
              <div key={i} className="file-row">
                <span className="name" style={{ fontWeight: 600 }}>{d.title}</span>
                <span className="muted" style={{ fontSize: 13 }}>다음 복습 {d.next}</span>
              </div>
            ))}
          </section>
        )}
        <Link to="/licks" className="btn light" style={{ alignSelf: 'flex-start' }}>릭 보관함으로</Link>
      </div>
    );
  }

  const best = bestBpm(lick);

  return (
    <div className="page" style={{ gap: 20 }}>
      <header className="page-head">
        <div>
          <Link to="/licks" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 15 }}>
            <Icon name="back" size={18} strokeWidth={2} />
            릭 보관함
          </Link>
          <span className="eyebrow">복습 {index + 1} / {queue.length}</span>
          <h1 className="title-l">{lick.title}</h1>
          <span className="muted" style={{ fontSize: 14 }}>
            {song ? `${song.title}에서` : '직접 적은 릭'} · {lick.tab.tuningLabel} · {lick.tab.bpm} BPM
            {lick.bpmGoal ? ` · 목표 ${lick.bpmGoal}` : ''}
            {best ? ` · 최고 ${best}` : ''}
          </span>
        </div>
        <Link to={`/tabs/${lick.id}`} className="btn sm">타브 편집</Link>
      </header>

      <div className="progress" aria-label={`${queue.length}개 중 ${index}개 완료`}>
        <span style={{ width: `${(index / queue.length) * 100}%`, background: 'var(--accent)' }} />
      </div>

      {lick.source && song && <SourceLoop key={lick.id} lick={lick} song={song} analysis={analysisQ.data ?? null} />}

      <section className="card lg" aria-label="타브" style={{ gap: 16 }}>
        <div className="card-head" style={{ alignItems: 'center' }}>
          <div className="chips" style={{ alignItems: 'center', gap: 12 }}>
            <button type="button" className="play-btn md" aria-label={playing ? '멈춤' : '타브 듣기'} onClick={toggle}>
              <Icon name={playing ? 'pause' : 'play'} size={22} />
            </button>
            <Segmented label="속도" value={rate} onChange={(v) => { setRate(v); if (playing) { player.current!.stop(); setPlaying(false); setPos(null); } }} options={[0.5, 0.75, 1].map((v) => ({ value: v, label: `${Math.round(v * 100)}%` }))} />
          </div>
          {lick.memo && <span className="muted" style={{ fontSize: 13, maxWidth: 420 }}>메모: {lick.memo}</span>}
        </div>
        <TabStaff tab={lick.tab} playing={pos} compact={false} onCellClick={() => undefined} />
      </section>

      <section className="card" aria-label="평가" style={{ gap: 16 }}>
        <div className="card-head" style={{ alignItems: 'center' }}>
          <h2 className="title-s">얼마나 기억났나요?</h2>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            오늘 친 BPM
            <input className="input" type="number" min={30} max={400} placeholder={String(lick.tab.bpm)} value={bpm} onChange={(e) => setBpm(e.target.value)} style={{ width: 96, minHeight: 36 }} />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {RATINGS.map((r) => (
            <button key={r.value} type="button" className="rating-btn" onClick={() => rate_(r.value)} style={r.value === 'again' ? { color: 'var(--red)' } : undefined}>
              {r.label}
              <small>{r.hint}</small>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
