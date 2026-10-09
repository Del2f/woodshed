import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Segmented } from '../../components/controls';
import { requestFolderAccess, resolveSongFile } from '../../lib/audioFolder';
import { formatTimePrecise } from '../../lib/format';
import { getCachedStem } from '../../lib/stemCache';
import type { Lick, Song, SongAnalysis } from '../../lib/store/types';

type Track = 'original' | 'guitar';

/**
 * 릭을 딴 원곡 구간을 반복 재생 — 타브를 적거나 복습할 때 옆에 두고 듣는다.
 * 기타 분리 트랙이 이 브라우저에 저장돼 있으면 '기타만'으로도 들을 수 있다.
 */
export function SourceLoop({ lick, song, analysis }: { lick: Lick; song: Song; analysis: SongAnalysis | null }) {
  const src = lick.source!;
  const audio = useRef<HTMLAudioElement | null>(null);
  const raf = useRef(0);
  const [track, setTrack] = useState<Track>('original');
  const [urls, setUrls] = useState<Partial<Record<Track, string>>>({});
  const [need, setNeed] = useState<FileSystemHandle | null>(null);
  const [missing, setMissing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(src.speed || 1);
  const [pos, setPos] = useState(src.start);

  const load = useCallback(async () => {
    const r = await resolveSongFile(song.fileName);
    if (r.status === 'need-permission') return setNeed(r.handle);
    if (r.status === 'missing') return setMissing(true);
    setNeed(null);
    const next: Partial<Record<Track, string>> = { original: URL.createObjectURL(r.file) };
    if (analysis?.stems.includes('guitar')) {
      const g = await getCachedStem(analysis.fileHash, 'guitar');
      if (g) next.guitar = URL.createObjectURL(g);
    }
    setUrls(next);
  }, [song.fileName, analysis]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => () => Object.values(urls).forEach((u) => u && URL.revokeObjectURL(u)), [urls]);

  // 오디오 요소: 트랙을 바꾸면 같은 위치에서 이어서 (속도는 아래 effect가 따로 반영)
  useEffect(() => {
    const url = urls[track];
    if (!url) return;
    const prev = audio.current;
    const at = prev ? prev.currentTime : src.start;
    const wasPlaying = prev ? !prev.paused : false;
    prev?.pause();
    const a = new Audio(url);
    a.preservesPitch = true;
    a.playbackRate = speed;
    a.currentTime = at >= src.start && at < src.end ? at : src.start;
    audio.current = a;
    if (wasPlaying) a.play().catch(() => setPlaying(false));
    return () => a.pause();
  }, [urls, track, src.start, src.end]);

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = speed;
  }, [speed]);

  // 구간 끝을 넘으면 처음으로 — timeupdate는 너무 드물어 화면 갱신마다 확인
  useEffect(() => {
    if (!playing) return;
    const step = () => {
      const a = audio.current;
      if (a) {
        if (a.currentTime >= src.end || a.currentTime < src.start - 0.05) a.currentTime = src.start;
        setPos(a.currentTime);
      }
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, src.start, src.end]);

  const toggle = async () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) {
      if (a.currentTime < src.start || a.currentTime >= src.end) a.currentTime = src.start;
      await a.play();
      setPlaying(true);
    } else {
      a.pause();
      setPlaying(false);
    }
  };

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const pct = Math.max(0, Math.min(1, (pos - src.start) / Math.max(0.01, src.end - src.start)));

  return (
    <section className="card" aria-label="원곡 구간" style={{ gap: 12, padding: '18px 22px' }}>
      <div className="card-head" style={{ alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontWeight: 700 }}>원곡 구간</span>
          <Link to={`/player/${song.id}`} className="muted" style={{ fontSize: 13 }}>
            {song.title} · {formatTimePrecise(src.start)}–{formatTimePrecise(src.end)}
          </Link>
        </div>
        <div className="chips" style={{ alignItems: 'center', gap: 10 }}>
          {urls.guitar && (
            <Segmented label="원곡 트랙" surface value={track} onChange={setTrack} options={[{ value: 'original', label: '원곡' }, { value: 'guitar', label: '기타만' }]} />
          )}
          <Segmented
            label="원곡 속도"
            surface
            value={[0.5, 0.7, 0.85, 1].includes(speed) ? speed : -1}
            onChange={setSpeed}
            options={[0.5, 0.7, 0.85, 1].map((v) => ({ value: v, label: `${Math.round(v * 100)}%` }))}
          />
        </div>
      </div>

      {need ? (
        <button type="button" className="btn sm primary" style={{ alignSelf: 'flex-start' }} onClick={async () => (await requestFolderAccess(need)) && load()}>
          “{need.name}” 읽기 허용
        </button>
      ) : missing ? (
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>원곡 파일을 찾지 못했어요. 플레이어에서 파일을 다시 연결해 주세요.</p>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button type="button" className="icon-btn" aria-label={playing ? '원곡 멈춤' : '원곡 구간 반복 재생'} onClick={toggle} disabled={!urls.original}>
            <Icon name={playing ? 'pause' : 'play'} size={18} />
          </button>
          <div className="progress" style={{ flex: 1 }}>
            <span style={{ width: `${pct * 100}%`, background: 'var(--accent)' }} />
          </div>
          <span className="mono muted" style={{ fontSize: 12, width: 64, textAlign: 'right' }}>
            {formatTimePrecise(pos)}
          </span>
        </div>
      )}
    </section>
  );
}
