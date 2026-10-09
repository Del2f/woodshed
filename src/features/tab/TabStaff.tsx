import { memo } from 'react';
import { cellText, type TabData } from './model';

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export interface Cursor {
  m: number;
  s: number;
  str: number;
}

/**
 * 타브 악보. 높은 줄이 위, 마디마다 칸 격자. 박 경계는 진한 선.
 * compact: 카드·복습용 작은 보기 (클릭 불가)
 */
export const TabStaff = memo(function TabStaff({
  tab,
  cursor,
  playing,
  onCellClick,
  compact,
  maxMeasures,
}: {
  tab: TabData;
  cursor?: Cursor | null;
  /** 재생 중인 위치 */
  playing?: { m: number; s: number } | null;
  onCellClick?: (c: Cursor) => void;
  compact?: boolean;
  maxMeasures?: number;
}) {
  const strings = tab.tuning.length;
  const order = Array.from({ length: strings }, (_, i) => strings - 1 - i); // 높은 줄부터
  const measures = maxMeasures ? tab.measures.slice(0, maxMeasures) : tab.measures;
  const cw = compact ? 15 : 30;
  const ch = compact ? 16 : 26;

  return (
    <div className={`tab-staff${compact ? ' compact' : ''}`} role={compact ? 'img' : 'grid'} aria-label="타브 악보">
      {!compact && (
        <div className="tab-names" aria-hidden="true">
          <span className="tab-num">&nbsp;</span>
          <span className="tab-pm-row" />
          {order.map((str) => (
            <span key={str} style={{ height: ch }}>
              {str === strings - 1 ? NAMES[tab.tuning[str] % 12].toLowerCase() : NAMES[tab.tuning[str] % 12]}
            </span>
          ))}
        </div>
      )}
      {measures.map((meas, m) => {
        const perBeat = meas.grid / tab.beatsPerBar;
        const hasPM = meas.pm.some(Boolean);
        return (
          <div key={meas.id} className="tab-measure">
            {!compact && <span className="tab-num">{m + 1}</span>}
            {(!compact || hasPM) && (
              <div className="tab-pm-row" style={{ gridTemplateColumns: `repeat(${meas.grid}, ${cw}px)` }}>
                {meas.pm.map((on, s) => (
                  <span key={s} className={on ? 'on' : undefined}>
                    {on && (s === 0 || !meas.pm[s - 1]) ? 'PM' : ''}
                  </span>
                ))}
              </div>
            )}
            {order.map((str) => (
              <div key={str} className="tab-row" style={{ gridTemplateColumns: `repeat(${meas.grid}, ${cw}px)` }}>
                {meas.cells.map((col, s) => {
                  const note = col[str];
                  const isCursor = !!cursor && cursor.m === m && cursor.s === s && cursor.str === str;
                  const isPlaying = !!playing && playing.m === m && playing.s === s;
                  const cls = `tab-cell${s % perBeat === 0 ? ' beat' : ''}${isCursor ? ' cursor' : ''}${isPlaying ? ' playing' : ''}${note ? ' has' : ''}`;
                  const text = cellText(note);
                  return compact ? (
                    <span key={s} className={cls} style={{ height: ch }}>
                      {text && <b>{text}</b>}
                    </span>
                  ) : (
                    <button
                      key={s}
                      type="button"
                      className={cls}
                      style={{ height: ch }}
                      aria-label={`${m + 1}마디 ${s + 1}칸 ${strings - str}번 줄${text ? ` ${text}` : ''}`}
                      tabIndex={isCursor ? 0 : -1}
                      onMouseDown={(e) => {
                        e.preventDefault(); // 포커스를 페이지 키보드 처리에 남겨 둔다
                        onCellClick?.({ m, s, str });
                      }}
                    >
                      {text && <b>{text}</b>}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        );
      })}
      {maxMeasures && tab.measures.length > maxMeasures && <span className="tab-more">+{tab.measures.length - maxMeasures}마디</span>}
    </div>
  );
});
