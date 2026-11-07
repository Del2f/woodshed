import { Fragment, type ReactNode } from 'react';
import type { LessonBlock } from './curriculum';
import { ModeTable, PickingDrill, ScaleDrill, SweepDrill, SweepProgressionDrill } from './Drills';

/** 글 안의 **굵게** → <b> */
export function rich(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : <Fragment key={i}>{part}</Fragment>,
  );
}

/** 데이터로 적은 레슨을 공통 블록으로 그린다. 위쪽에서 고른 튜닝이 모든 지판·연습에 쓰인다 */
export function LessonBlocks({ lessonId, blocks, strings, tuningLabel }: { lessonId: string; blocks: LessonBlock[]; strings: number[]; tuningLabel: string }) {
  return (
    <>
      {blocks.map((b, i) => (
        <section key={i} className="card lg lesson-section">
          <h2 className="title-s">{b.title}</h2>
          {b.type === 'text' && (
            <>
              {b.body.map((p, j) => (
                <p key={j}>{rich(p)}</p>
              ))}
              {b.note && <p className="muted">{rich(b.note)}</p>}
            </>
          )}
          {b.type === 'tips' && (
            <ul className="lesson-list">
              {b.items.map((t, j) => (
                <li key={j}>{rich(t)}</li>
              ))}
            </ul>
          )}
          {b.type !== 'text' && b.type !== 'tips' && b.intro && <p>{rich(b.intro)}</p>}
          {b.type === 'modeTable' && <ModeTable />}
          {b.type === 'scaleDrill' && (
            <ScaleDrill
              lessonId={lessonId}
              strings={strings}
              tuningLabel={tuningLabel}
              modes={b.modes}
              defaultMode={b.defaultMode}
              defaultRoot={b.defaultRoot}
              drone={b.drone}
              defaultLegato={b.defaultLegato}
              levels={b.levels}
            />
          )}
          {b.type === 'sweepDrill' && (
            <SweepDrill
              lessonId={lessonId}
              strings={strings}
              tuningLabel={tuningLabel}
              stringCount={b.strings}
              defaultRoot={b.defaultRoot}
              defaultKeyMode={b.defaultKeyMode}
              levels={b.levels}
            />
          )}
          {b.type === 'sweepProgression' && (
            <SweepProgressionDrill
              lessonId={lessonId}
              strings={strings}
              tuningLabel={tuningLabel}
              defaultRoot={b.defaultRoot}
              defaultKeyMode={b.defaultKeyMode}
              levels={b.levels}
            />
          )}
          {b.type === 'pickingDrill' && (
            <PickingDrill
              lessonId={lessonId}
              strings={strings}
              tuningLabel={tuningLabel}
              exercise={b.exercise}
              defaultLegato={b.defaultLegato}
              modes={b.modes}
              defaultMode={b.defaultMode}
            />
          )}
        </section>
      ))}
    </>
  );
}
