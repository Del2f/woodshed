import { chordTones, pcName, type Chord, type ScaleChoice, type ToneFn } from '../lib/theory';

export type FretboardMode = 'tones' | 'scale' | 'names';

const FN_STYLE: Record<ToneFn, { bg: string; fg: string; text: string }> = {
  R: { bg: '#FF9F0A', fg: '#000', text: 'R' },
  '3': { bg: '#0060DF', fg: '#fff', text: '3' },
  b3: { bg: '#0060DF', fg: '#fff', text: '♭3' },
  '5': { bg: '#E5E5EA', fg: '#000', text: '5' },
  b7: { bg: '#BF5AF2', fg: '#000', text: '♭7' },
};

const MARKERS = new Set([3, 5, 7, 9, 12, 15, 17, 19, 21]);

/**
 * 지판 위에 코드톤과 스케일을 표시한다.
 * strings: 낮은 줄 → 높은 줄 MIDI 번호 (화면에는 높은 줄이 위)
 */
export function Fretboard({
  strings,
  chord,
  scale,
  mode,
  frets = 15,
}: {
  strings: number[];
  chord: Chord | null;
  scale: ScaleChoice | null;
  mode: FretboardMode;
  frets?: number;
}) {
  const tones = new Map((chord ? chordTones(chord) : []).map((t) => [t.pc, t]));
  const inScale = new Set(scale?.pcs ?? []);
  const special = new Set(scale?.special ?? []);
  const nameOf = (pc: number) => tones.get(pc)?.name ?? scale?.names[pc] ?? pcName(pc);
  const rows = [...strings].reverse();
  const thick = (i: number) => 1 + (rows.length - 1 - i) * 0.45;
  const cols = `52px repeat(${frets}, minmax(0, 1fr))`;

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
      <div className="fretboard" style={{ minWidth: 60 * frets }} role="img" aria-label={`지판: ${chord ? chord.label : ''} ${scale ? scale.name : ''}`}>
        {rows.map((open, si) => (
          <div key={si} className="fb-row" style={{ gridTemplateColumns: cols }}>
            {Array.from({ length: frets + 1 }, (_, f) => {
              const pc = (open + f) % 12;
              const tone = tones.get(pc);
              let cell: { bg: string; fg: string; bd: string; text: string } | null = null;
              if (mode === 'scale') {
                if (inScale.has(pc)) {
                  if (pc === scale!.root) cell = { bg: '#FF9F0A', fg: '#000', bd: 'transparent', text: nameOf(pc) };
                  else if (special.has(pc)) cell = { bg: '#1B140F', fg: '#7DBBFF', bd: '#0A84FF', text: nameOf(pc) };
                  else cell = { bg: '#1B140F', fg: '#E5E5EA', bd: '#8E8E93', text: nameOf(pc) };
                }
              } else if (tone) {
                const st = FN_STYLE[tone.fn];
                cell = { bg: st.bg, fg: st.fg, bd: 'transparent', text: mode === 'names' ? tone.name : st.text };
              } else if (inScale.has(pc)) {
                cell = { bg: '#1B140F', fg: '#A1A1A6', bd: special.has(pc) ? '#0A84FF' : '#636366', text: nameOf(pc) };
              }
              return (
                <div
                  key={f}
                  className={`fb-cell${f === 0 ? ' open' : ''}`}
                  style={{ backgroundSize: `100% ${thick(si)}px` }}
                >
                  {cell && (
                    <span className="fb-dot" style={{ background: cell.bg, color: cell.fg, borderColor: cell.bd }}>
                      {cell.text}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="fb-row fb-nums" style={{ gridTemplateColumns: cols, minWidth: 60 * frets }}>
        {Array.from({ length: frets + 1 }, (_, f) => (
          <span key={f} className={MARKERS.has(f) ? 'mark' : undefined}>
            {f === 0 ? '개방' : f}
          </span>
        ))}
      </div>
    </div>
  );
}

export function FretboardLegend() {
  return (
    <div className="chips" style={{ gap: 16, fontSize: 13, color: 'var(--text-3)' }}>
      {(['R', '3', '5', 'b7'] as ToneFn[]).map((fn) => (
        <span key={fn} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, height: 14, borderRadius: 7, background: FN_STYLE[fn].bg }} />
          {fn === 'R' ? '근음' : fn === '3' ? '3도' : fn === '5' ? '5도' : '7도'}
        </span>
      ))}
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 14, height: 14, borderRadius: 7, border: '1.5px solid #636366' }} />
        스케일 음
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 14, height: 14, borderRadius: 7, border: '1.5px solid #0A84FF' }} />
        특징음
      </span>
    </div>
  );
}
