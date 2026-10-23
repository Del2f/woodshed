import { stringNumber, type Spot } from './fretNotes';

/**
 * 레슨용 지판 — 플레이어 지판(components/Fretboard)과 같은 모양이지만 칸을 누를 수 있고,
 * 점마다 역할(질문·정답·오답·옥타브 등)을 따로 칠한다.
 */

export type DotKind = 'root' | 'note' | 'faint' | 'ask' | 'good' | 'bad' | 'ring';

export interface BoardDot {
  text: string;
  kind: DotKind;
}

const STYLE: Record<DotKind, { bg: string; fg: string; bd: string }> = {
  root: { bg: '#FF9F0A', fg: '#000', bd: 'transparent' },
  note: { bg: '#1B140F', fg: '#E5E5EA', bd: '#8E8E93' },
  faint: { bg: '#1B140F', fg: '#8E8E93', bd: 'transparent' },
  ask: { bg: '#FF9F0A', fg: '#000', bd: '#FFD60A' },
  good: { bg: '#30D158', fg: '#000', bd: 'transparent' },
  bad: { bg: '#FF6961', fg: '#000', bd: 'transparent' },
  ring: { bg: '#1B140F', fg: '#FFB340', bd: '#FF9F0A' },
};

const MARKERS = new Set([3, 5, 7, 9, 12, 15, 17, 19, 21]);

export const spotKey = (s: Spot) => `${s.si}:${s.fret}`;

export function NoteBoard({
  strings,
  frets = 12,
  dots,
  onPick,
  canPick,
  dimStrings,
  rows,
  label,
}: {
  /** 낮은 줄 → 높은 줄 MIDI (화면에는 높은 줄이 위) */
  strings: number[];
  frets?: number;
  dots: Map<string, BoardDot>;
  onPick?: (s: Spot) => void;
  /** 누를 수 있는 칸 (없으면 전부) */
  canPick?: (s: Spot) => boolean;
  /** 흐리게 보일 줄 (si) */
  dimStrings?: Set<number>;
  /** 보일 줄만 (si). 없으면 전부 */
  rows?: number[];
  label: string;
}) {
  const order = (rows ?? strings.map((_, si) => si)).slice().sort((a, b) => b - a);
  const thick = (si: number) => 1 + (strings.length - 1 - si) * 0.45;
  const cols = `28px 52px repeat(${frets}, minmax(0, 1fr))`;
  const minWidth = 46 * frets + 28;

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
      <div className="fretboard lesson" style={{ minWidth }} role={onPick ? 'group' : 'img'} aria-label={label}>
        {order.map((si) => (
          <div key={si} className={`fb-row${dimStrings?.has(si) ? ' dim' : ''}`} style={{ gridTemplateColumns: cols }}>
            <span className="fb-string">{stringNumber(strings, si)}</span>
            {Array.from({ length: frets + 1 }, (_, fret) => {
              const spot = { si, fret };
              const dot = dots.get(spotKey(spot));
              const st = dot ? STYLE[dot.kind] : null;
              const body = dot && st && (
                <span className={`fb-dot${dot.kind === 'ask' ? ' ask' : ''}`} style={{ background: st.bg, color: st.fg, borderColor: st.bd }}>
                  {dot.text}
                </span>
              );
              const cls = `fb-cell${fret === 0 ? ' open' : ''}`;
              const style = { backgroundSize: `100% ${thick(si)}px` };
              if (!onPick) return <div key={fret} className={cls} style={style}>{body}</div>;
              const enabled = canPick ? canPick(spot) : true;
              return (
                <button
                  key={fret}
                  type="button"
                  className={cls}
                  style={style}
                  disabled={!enabled}
                  aria-label={`${stringNumber(strings, si)}번 줄 ${fret === 0 ? '개방' : `${fret}프렛`}`}
                  onClick={() => onPick(spot)}
                >
                  {body}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="fb-row fb-nums" style={{ gridTemplateColumns: cols, minWidth }}>
        <span />
        {Array.from({ length: frets + 1 }, (_, f) => (
          <span key={f} className={MARKERS.has(f) ? 'mark' : undefined}>
            {f === 0 ? '개방' : f}
          </span>
        ))}
      </div>
    </div>
  );
}
