import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { Segmented } from '../../components/controls';
import { requestFolderAccess, resolveSongFile } from '../../lib/audioFolder';
import { transcribeWithEngine, useEngine } from '../../lib/engine';
import { getCachedStem } from '../../lib/stemCache';
import type { Lick, Song, SongAnalysis } from '../../lib/store/types';
import { isEmpty, MAX_FRET, type TabData } from './model';
import { barBounds, draftTab, SENSITIVITY, type HeardNote, type Sensitivity } from './transcribe';

type State =
  | { kind: 'idle' }
  | { kind: 'working'; step: string }
  | { kind: 'done'; heard: HeardNote[]; source: 'guitar' | 'mix'; placed: number; skipped: number }
  | { kind: 'error'; message: string; retry?: FileSystemHandle };

/**
 * 원곡 구간을 엔진에 보내 음을 받아 적고, 지금 타브 자리에 초안으로 채운다.
 * 받아 온 음은 기억해 두고 민감도만 바꿔 다시 채울 수 있다 (엔진을 다시 부르지 않음).
 */
export function DraftFromAudio({ lick, song, analysis, onApply }: { lick: Lick; song: Song; analysis: SongAnalysis | null; onApply: (tab: TabData) => void }) {
  const { health, online } = useEngine();
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [sens, setSens] = useState<Sensitivity>('mid');
  const src = lick.source!;
  const tab = lick.tab;
  const hasStem = !!analysis?.stems.includes('guitar');

  const apply = (heard: HeardNote[], s: Sensitivity, source: 'guitar' | 'mix') => {
    const bounds = barBounds(src.start, analysis?.downbeats ?? null, tab.bpm, tab.measures.length, tab.beatsPerBar);
    const r = draftTab(tab, heard, bounds, SENSITIVITY[s]);
    onApply(r.tab);
    setState({ kind: 'done', heard, source, placed: r.placed, skipped: r.skipped });
  };

  const run = async () => {
    if (!isEmpty(tab) && !confirm('지금 적어 둔 타브를 초안으로 바꿀까요?\nCtrl+Z로 되돌릴 수 있어요.')) return;
    try {
      setState({ kind: 'working', step: '음원 여는 중' });
      // 브라우저에 저장해 둔 기타 분리 트랙이 있으면 그걸 보낸다 — 작고, 다른 악기가 섞이지 않아 정확하다
      let audio: Blob | null = hasStem ? await getCachedStem(analysis!.fileHash, 'guitar') : null;
      let name = 'guitar.flac';
      let source: 'auto' | 'mix' = 'mix';
      const fromStem = !!audio;
      if (!audio) {
        const r = await resolveSongFile(song.fileName);
        if (r.status === 'need-permission') {
          setState({ kind: 'error', message: '음원 폴더를 읽을 권한이 필요해요.', retry: r.handle });
          return;
        }
        if (r.status === 'missing') {
          setState({ kind: 'error', message: '음원 파일을 찾을 수 없어요. 플레이어에서 파일을 다시 연결해 주세요.' });
          return;
        }
        audio = r.file;
        name = r.file.name;
        source = 'auto';
      }
      setState({ kind: 'working', step: '엔진이 음을 듣는 중…' });
      const res = await transcribeWithEngine(audio, name, {
        start: src.start,
        end: src.end,
        source,
        minMidi: Math.min(...tab.tuning),
        maxMidi: Math.max(...tab.tuning) + MAX_FRET - 2,
      });
      apply(res.notes, sens, fromStem ? 'guitar' : res.source);
    } catch (e) {
      setState({ kind: 'error', message: (e as Error).message });
    }
  };

  const busy = state.kind === 'working';
  const tooOld = online && !health?.features.transcribe;

  return (
    <section className="card" aria-label="음원에서 타브 초안" style={{ gap: 12 }}>
      <div className="card-head" style={{ alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <h2 className="title-s">음원에서 타브 초안</h2>
          <span className="muted" style={{ fontSize: 13 }}>
            엔진이 원곡 구간을 듣고 음을 받아 적어요. {hasStem ? '분리해 둔 기타 트랙으로 들어요.' : '플레이어에서 기타를 분리해 두면 훨씬 정확해요.'}
          </span>
        </div>
        <button type="button" className="btn sm primary" onClick={run} disabled={!online || tooOld || busy}>
          <Icon name="wave" size={16} strokeWidth={2} />
          {state.kind === 'working' ? state.step : state.kind === 'done' ? '다시 받아 적기' : '초안 만들기'}
        </button>
      </div>

      {!online && <span className="muted" style={{ fontSize: 13 }}>분석 엔진이 꺼져 있어요. 엔진을 켜면 쓸 수 있어요.</span>}
      {tooOld && <span style={{ fontSize: 13, color: 'var(--accent-text)' }}>엔진이 옛 버전이에요. 엔진 창을 닫고 start.bat 을 다시 실행하면 업데이트돼요.</span>}

      {state.kind === 'error' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 14, color: 'var(--red)' }}>
          {state.message}
          {state.retry && (
            <button type="button" className="btn sm" onClick={async () => (await requestFolderAccess(state.retry!)) && run()}>
              읽기 허용하고 다시
            </button>
          )}
        </div>
      )}

      {state.kind === 'done' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <Segmented
            label="민감도"
            value={sens}
            onChange={(v) => {
              setSens(v);
              apply(state.heard, v, state.source);
            }}
            options={[
              { value: 'low', label: '확실한 음만' },
              { value: 'mid', label: '보통' },
              { value: 'high', label: '작은 음까지' },
            ]}
          />
          <span className="muted" style={{ fontSize: 13 }}>
            음 {state.placed}개를 적었어요{state.skipped ? ` (${state.skipped}개는 줄 범위·박자 밖이라 뺐어요)` : ''} · {state.source === 'guitar' ? '기타 트랙' : '원곡 전체'} 기준. 초안이니 들어 보며 고쳐 주세요.
          </span>
        </div>
      )}
    </section>
  );
}
