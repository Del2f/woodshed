import { describe, expect, it } from 'vitest';
import {
  MODES, PROGRESSIONS, ROOTS, TRIADS, bpmAfterLoop, chainSweeps, chromaticDrillTab, chromaticNotes, degreeLabels, diatonicTriads, fretWindow,
  modeNoteNames, modeSemis, scaleDrillTab, sequenceDrillTab, sequenceOrder, shapeCenter, sweepCandidates, sweepCycle, sweepDrillTab, sweepShape,
  threeNpsPositions, type PatternNote, type TriadQuality,
} from './patterns';

const STD = [40, 45, 50, 55, 59, 64];
const DROP_D = [38, 45, 50, 55, 59, 64];
const DROP_C = [36, 43, 48, 53, 57, 62];
const SEVEN = [35, 40, 45, 50, 55, 59, 64];
const TUNINGS = { STD, DROP_D, DROP_C, SEVEN };

const frets = (notes: PatternNote[]) => notes.map((n) => [n.si, n.fret]);
const opts = { strings: STD, tuningLabel: 'Standard (E)', bpm: 60 };

describe('모드', () => {
  it('반음 구성', () => {
    expect(modeSemis('ionian')).toEqual([0, 2, 4, 5, 7, 9, 11]);
    expect(modeSemis('phrygian')).toEqual([0, 1, 3, 5, 7, 8, 10]);
    expect(modeSemis('lydian')).toEqual([0, 2, 4, 6, 7, 9, 11]);
    expect(modeSemis('locrian')).toEqual([0, 1, 3, 5, 6, 8, 10]);
    expect(modeSemis('aeolian')).toEqual([0, 2, 3, 5, 7, 8, 10]);
  });

  it('도수 이름', () => {
    expect(degreeLabels(modeSemis('phrygian'))).toEqual(['1', 'b2', 'b3', '4', '5', 'b6', 'b7']);
    expect(degreeLabels(modeSemis('lydian'))).toEqual(['1', '2', '3', '#4', '5', '6', '7']);
    expect(degreeLabels(modeSemis('locrian'))).toEqual(['1', 'b2', 'b3', '4', 'b5', 'b6', 'b7']);
  });

  it('음 이름 철자', () => {
    expect(modeNoteNames('E', 'phrygian')).toEqual(['E', 'F', 'G', 'A', 'B', 'C', 'D']);
    expect(modeNoteNames('F#', 'locrian')).toEqual(['F#', 'G', 'A', 'B', 'C', 'D', 'E']);
    expect(modeNoteNames('Bb', 'ionian')).toEqual(['Bb', 'C', 'D', 'Eb', 'F', 'G', 'A']);
  });

  it('밝기 순서는 1–7이 한 번씩, 특징음은 그 모드에 있는 음', () => {
    expect(MODES.map((m) => m.brightness).sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const m of MODES) expect(modeSemis(m.id)).toContain(m.color);
  });
});

describe('3nps 포지션', () => {
  it('G 메이저 3프렛 포지션 — 잘 알려진 모양', () => {
    const pos = threeNpsPositions(STD, 7, modeSemis('ionian'));
    const g = pos.find((p) => p[0].fret === 3)!;
    expect(frets(g)).toEqual([
      [0, 3], [0, 5], [0, 7],
      [1, 3], [1, 5], [1, 7],
      [2, 4], [2, 5], [2, 7],
      [3, 4], [3, 5], [3, 7],
      [4, 5], [4, 7], [4, 8],
      [5, 5], [5, 7], [5, 8],
    ]);
    expect(g[0].root).toBe(true);
    expect(g.filter((n) => n.root)).toHaveLength(3);
  });

  it('포지션은 지판 낮은 쪽부터', () => {
    const starts = threeNpsPositions(STD, 7, modeSemis('ionian')).map((p) => p[0].fret);
    expect(starts).toEqual([2, 3, 5, 7, 8, 10, 12]);
  });

  it('모든 키·모드·튜닝: 줄마다 3음, 스케일 음만, 오름차순, 개방현 없음, 한 줄에 5칸 이내', () => {
    for (const strings of Object.values(TUNINGS)) {
      for (const { pc } of ROOTS) {
        for (const m of MODES) {
          const semis = modeSemis(m.id);
          const pcs = semis.map((s) => (pc + s) % 12);
          const positions = threeNpsPositions(strings, pc, semis);
          expect(positions).toHaveLength(7);
          for (const p of positions) {
            expect(p).toHaveLength(strings.length * 3);
            p.forEach((n, i) => {
              expect(pcs).toContain(n.midi % 12);
              expect(n.midi).toBe(strings[n.si] + n.fret);
              expect(n.si).toBe(Math.floor(i / 3));
              expect(n.fret).toBeGreaterThanOrEqual(1);
              if (i) expect(n.midi).toBeGreaterThan(p[i - 1].midi);
            });
            for (let si = 0; si < strings.length; si++) {
              const f = p.filter((n) => n.si === si).map((n) => n.fret);
              expect(Math.max(...f) - Math.min(...f)).toBeLessThanOrEqual(4);
            }
          }
        }
      }
    }
  });
});

describe('스윕 모양', () => {
  it('A 메이저 5줄 기본형 — 5번 줄 12-16, 14, 14, 14, 1번 줄 12-17', () => {
    expect(frets(sweepShape(STD, 5, 9, 'maj', 0)!)).toEqual([[1, 12], [1, 16], [2, 14], [3, 14], [4, 14], [5, 12], [5, 17]]);
  });

  it('A 마이너 5줄 기본형 — 12-15, 14, 14, 13, 12-17', () => {
    expect(frets(sweepShape(STD, 5, 9, 'min', 0)!)).toEqual([[1, 12], [1, 15], [2, 14], [3, 14], [4, 13], [5, 12], [5, 17]]);
  });

  it('A 메이저 3줄 기본형 — G 14, B 14, e 12-17', () => {
    const s = sweepShape(STD, 3, 9, 'maj', 0)!;
    expect(frets(s)).toEqual([[3, 14], [4, 14], [5, 12], [5, 17]]);
    expect(s.map((n) => n.label)).toEqual(['R', '3', '5', 'R']);
  });

  it('A 메이저 4줄 기본형 — 4번 줄 7, 6, 5, 1번 줄 5-9', () => {
    expect(frets(sweepShape(STD, 4, 9, 'maj', 0)!)).toEqual([[2, 7], [3, 6], [4, 5], [5, 5], [5, 9]]);
  });

  it('인버전마다 가장 낮은 음이 바뀐다', () => {
    expect(sweepShape(STD, 3, 4, 'min', 0)![0].label).toBe('R');
    expect(sweepShape(STD, 3, 4, 'min', 1)![0].label).toBe('b3');
    expect(sweepShape(STD, 3, 4, 'min', 2)![0].label).toBe('5');
  });

  it('모든 키·종류·인버전·튜닝(3·4·5줄): 화음 음만, 오름차순, 줄마다 1–2음, 손 벌림 6칸 이내', () => {
    for (const strings of Object.values(TUNINGS)) {
      for (const { pc } of ROOTS) {
        for (const q of Object.keys(TRIADS) as TriadQuality[]) {
          const pcs = TRIADS[q].semis.map((s) => (pc + s) % 12);
          for (const n of [3, 4, 5] as const) {
            for (const inv of [0, 1, 2]) {
              const s = sweepShape(strings, n, pc, q, inv);
              if (q !== 'aug') expect(s, `${pc} ${q} ${n}줄 ${inv}`).not.toBeNull();
              if (!s) continue;
              s.forEach((note, i) => {
                expect(pcs).toContain(note.midi % 12);
                expect(note.midi).toBe(strings[note.si] + note.fret);
                if (i) expect(note.midi).toBeGreaterThan(s[i - 1].midi);
              });
              const used = new Set(s.map((x) => x.si));
              expect(used.size).toBe(n);
              expect(Math.min(...used)).toBe(strings.length - n);
              for (const si of used) expect(s.filter((x) => x.si === si).length).toBeLessThanOrEqual(2);
              const f = s.map((x) => x.fret);
              expect(Math.min(...f)).toBeGreaterThanOrEqual(1);
              expect(Math.max(...f) - Math.min(...f)).toBeLessThanOrEqual(6);
            }
          }
        }
      }
    }
  });
});

describe('코드 진행 따라 스윕 잇기', () => {
  it('후보: 인버전 3개 × 두 옥타브 중 되는 자리, 기본 모양을 포함', () => {
    const c = sweepCandidates(STD, 3, 9, 'maj');
    expect(c.length).toBeGreaterThanOrEqual(3);
    expect(c.map(frets)).toContainEqual(frets(sweepShape(STD, 3, 9, 'maj', 0)!));
  });

  it('E 마이너 i–VI–VII–i (3줄): 9프렛 근처에서 시작해 손이 조금씩만 움직인다', () => {
    const em = diatonicTriads(4, 'E', 'aeolian');
    const ch = chainSweeps(STD, 3, [0, 5, 6, 0].map((d) => em[d]))!;
    expect(frets(ch[0])).toEqual([[3, 9], [4, 8], [5, 7], [5, 12]]);
    expect(ch.map((s) => s[0].label)).toEqual(['R', '3', '3', 'b3']);
  });

  it('모든 키·진행·줄 수·튜닝: 빠짐없이, 흔한 모양으로, 3–16프렛 사이에서, 코드 사이 이동은 평균 4칸 이내', () => {
    const fullLength = { 3: 4, 4: 5, 5: 7 } as const;
    for (const strings of Object.values(TUNINGS)) {
      for (const { pc, name } of ROOTS) {
        for (const mode of ['aeolian', 'ionian'] as const) {
          const triads = diatonicTriads(pc, name, mode);
          for (const n of [3, 4, 5] as const) {
            for (const p of PROGRESSIONS[mode]) {
              const chords = p.degrees.map((d) => triads[d]);
              const ch = chainSweeps(strings, n, chords);
              expect(ch, `${name} ${mode} ${n}줄 ${p.id}`).not.toBeNull();
              ch!.forEach((shape, i) => {
                const pcs = TRIADS[chords[i].quality].semis.map((x) => (chords[i].root + x) % 12);
                for (const note of shape) expect(pcs).toContain(note.midi % 12);
                expect(shape).toHaveLength(fullLength[n]);
                const c = shapeCenter(shape);
                expect(c).toBeGreaterThanOrEqual(3);
                expect(c).toBeLessThanOrEqual(16);
                if (i) expect(Math.abs(c - shapeCenter(ch![i - 1]))).toBeLessThanOrEqual(4);
              });
            }
          }
        }
      }
    }
  });

  it('진행 이름의 도수는 키 안에 있다', () => {
    for (const list of Object.values(PROGRESSIONS)) for (const p of list) for (const d of p.degrees) expect(d >= 0 && d < 7).toBe(true);
  });
});

describe('피킹 연습', () => {
  it('크로매틱: 줄마다 네 칸, 손가락 번호, 1프렛 아래로는 안 감', () => {
    const n = chromaticNotes(STD, 5);
    expect(n).toHaveLength(24);
    expect(n.slice(0, 4).map((x) => [x.fret, x.label])).toEqual([[5, '1'], [6, '2'], [7, '3'], [8, '4']]);
    expect(chromaticNotes(STD, 0)[0].fret).toBe(1);
  });

  it('크로매틱 타브: 올라가며 1-2-3-4, 높은 줄부터 4-3-2-1로 내려옴, 16분음표 3마디', () => {
    const tab = chromaticDrillTab(chromaticNotes(STD, 5), opts);
    expect(tab.measures).toHaveLength(3);
    expect(tab.measures[0].grid).toBe(16);
    expect(tab.measures[1].cells[8][5]).toEqual({ fret: 8 }); // 25번째 음 = 1번 줄 8프렛(4번 손가락)부터 내려옴
    expect(tab.measures[1].cells[11][5]).toEqual({ fret: 5 });
    expect(tab.measures[1].cells[12][4]).toEqual({ fret: 8 });
  });

  it('시퀀스 순서: 1234 2345 …, 꼭대기 묶음을 되풀이하지 않고 내려와 맨 아래 음에서 끝', () => {
    const pos = threeNpsPositions(STD, 4, modeSemis('aeolian'))[0];
    const seq = sequenceOrder(pos, 4);
    expect(seq.slice(0, 8)).toEqual([pos[0], pos[1], pos[2], pos[3], pos[1], pos[2], pos[3], pos[4]]);
    expect(seq).toHaveLength(15 * 4 + 14 * 4);
    const top = pos.length - 1;
    expect(seq.slice(60, 64)).toEqual([pos[top - 1], pos[top - 2], pos[top - 3], pos[top - 4]]);
    expect(seq[seq.length - 1]).toBe(pos[0]);
    expect(sequenceOrder(pos, 3)).toHaveLength(16 * 3 + 15 * 3);
  });

  it('시퀀스 타브: 4음은 16분음표, 3음은 6연음, 레가토면 같은 줄 이음에 해머링·풀링', () => {
    const pos = threeNpsPositions(STD, 4, modeSemis('aeolian'))[0];
    expect(sequenceDrillTab(pos, 4, { ...opts, legato: false }).measures[0].grid).toBe(16);
    const t3 = sequenceDrillTab(pos, 3, { ...opts, legato: true });
    expect(t3.measures[0].grid).toBe(24);
    expect(t3.measures[0].cells[1][0]?.techs).toEqual(['h']);
    expect(t3.measures[0].cells[3][0]?.techs).toEqual(['p']); // 123 다음 묶음 234의 첫 음은 같은 줄에서 내려옴
  });
});

describe('키 안의 트라이어드', () => {
  it('E 마이너 키', () => {
    const t = diatonicTriads(4, 'E', 'aeolian');
    expect(t.map((x) => x.name)).toEqual(['Em', 'F#dim', 'G', 'Am', 'Bm', 'C', 'D']);
    expect(t.map((x) => x.roman)).toEqual(['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII']);
  });

  it('C 메이저 키', () => {
    const t = diatonicTriads(0, 'C', 'ionian');
    expect(t.map((x) => x.name)).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim']);
    expect(t.map((x) => x.roman)).toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']);
  });
});

describe('연습 타브', () => {
  it('스케일: 올라갔다 내려와 시작 음에서 멈춤, 6연음 2마디, 레가토 표시', () => {
    const g = threeNpsPositions(STD, 7, modeSemis('ionian')).find((p) => p[0].fret === 3)!;
    const tab = scaleDrillTab(g, { ...opts, legato: true });
    expect(tab.measures).toHaveLength(2);
    expect(tab.measures[0].grid).toBe(24);
    const m0 = tab.measures[0].cells;
    expect(m0[0][0]).toEqual({ fret: 3 });
    expect(m0[1][0]).toEqual({ fret: 5, techs: ['h'] });
    // 18번째 칸: 꼭대기(1번 줄 8프렛) 다음 1번 줄 7프렛 풀링
    expect(m0[17][5]).toEqual({ fret: 8, techs: ['h'] });
    expect(m0[18][5]).toEqual({ fret: 7, techs: ['p'] });
    // 35번째 음(2마디 11칸)이 시작 음 — 같은 줄에서 내려오므로 풀링, 그 뒤는 쉼
    expect(tab.measures[1].cells[10][0]).toEqual({ fret: 3, techs: ['p'] });
    expect(tab.measures[1].cells.slice(11).every((col) => col.every((c) => !c))).toBe(true);
  });

  it('스케일: 얼터네이트 피킹이면 주법 표시 없음', () => {
    const p = threeNpsPositions(STD, 4, modeSemis('phrygian'))[0];
    const tab = scaleDrillTab(p, { ...opts, legato: false });
    expect(tab.measures.flatMap((m) => m.cells.flat()).some((c) => c?.techs)).toBe(false);
  });

  it('스윕 한 바퀴: 맨 위·맨 아래를 두 번 치지 않는다', () => {
    const s = sweepShape(STD, 3, 9, 'maj', 0)!;
    expect(sweepCycle(s).map((n) => n.fret)).toEqual([14, 14, 12, 17, 12, 14]);
  });

  it('스윕 3줄: 6연음 한 마디에 4바퀴, 같은 줄은 해머링·풀링', () => {
    const tab = sweepDrillTab([sweepShape(STD, 3, 9, 'maj', 0)!], opts);
    expect(tab.measures).toHaveLength(1);
    expect(tab.measures[0].grid).toBe(24);
    const cells = tab.measures[0].cells;
    expect(cells[3][5]).toEqual({ fret: 17, techs: ['h'] });
    expect(cells[4][5]).toEqual({ fret: 12, techs: ['p'] });
    expect(cells[6][3]).toEqual({ fret: 14 });
    expect(cells[23][4]).toEqual({ fret: 14 });
  });

  it('스윕 4줄은 16분음표(한 바퀴 8음), 5줄은 6연음(12음)', () => {
    expect(sweepDrillTab([sweepShape(STD, 4, 9, 'maj', 0)!], opts).measures[0].grid).toBe(16);
    expect(sweepDrillTab([sweepShape(STD, 5, 9, 'maj', 0)!], opts).measures[0].grid).toBe(24);
  });

  it('인버전 이어 치기: 모양마다 한 마디', () => {
    const shapes = [0, 1, 2].map((i) => sweepShape(STD, 3, 4, 'min', i)!);
    const tab = sweepDrillTab(shapes, opts);
    expect(tab.measures).toHaveLength(3);
    expect(tab.measures[1].cells[0][3]).toEqual({ fret: shapes[1][0].fret });
  });

  it('인버전마다 한 바퀴 길이가 달라도 마디마다 맞는 박 나눔', () => {
    // F#dim 기본형은 3음 (1번 줄에서 다음 음까지 6칸이라 한 음만) → 한 바퀴 4음 = 16분음표
    const shapes = [0, 1].map((i) => sweepShape(STD, 3, 6, 'dim', i)!);
    expect(shapes[0]).toHaveLength(3);
    const tab = sweepDrillTab(shapes, opts);
    expect(tab.measures.map((m) => m.grid)).toEqual([16, 24]);
  });
});

describe('자동 BPM 올리기', () => {
  const cfg = { enabled: true, step: 5, everyLoops: 2, target: 70 };
  it('정해진 바퀴마다 올리고 목표에서 멈춤', () => {
    expect(bpmAfterLoop(60, 1, cfg)).toBe(60);
    expect(bpmAfterLoop(60, 2, cfg)).toBe(65);
    expect(bpmAfterLoop(68, 4, cfg)).toBe(70);
    expect(bpmAfterLoop(70, 6, cfg)).toBe(70);
    expect(bpmAfterLoop(60, 2, { ...cfg, enabled: false })).toBe(60);
  });
});

describe('지판 범위', () => {
  it('패턴 앞뒤 한 칸, 최소 8칸', () => {
    const s = sweepShape(STD, 5, 9, 'maj', 0)!; // 12–17
    expect(fretWindow(s)).toEqual({ start: 11, count: 8 });
    const low = threeNpsPositions(STD, 7, modeSemis('ionian'))[0]; // 2프렛부터
    expect(fretWindow(low)).toEqual({ start: 1, count: 8 });
    expect(fretWindow([{ si: 0, fret: 1, midi: 41, label: '1', root: true }])).toEqual({ start: 0, count: 8 });
  });
});
