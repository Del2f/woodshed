/**
 * 커리큘럼 — 세 갈래(트랙): 지판과 이론 / 테크닉 / 실전 응용.
 * ready가 아닌 레슨은 목록에 '준비 중'으로만 보인다.
 * blocks가 있는 레슨은 공통 블록(설명·연습 카드·표)으로 그린다 — 새 레슨은 화면 코드 없이 여기 데이터만 적으면 된다.
 * 레슨 id는 퀴즈 기록·연습 목록과 이어져 있으므로 바꾸지 않는다.
 */

import type { ModeId } from './patterns';

export type TrackId = 'theory' | 'technique' | 'apply';

export const TRACKS: { id: TrackId; title: string; summary: string }[] = [
  { id: 'theory', title: '지판과 이론', summary: '지판 음 이름부터 스케일·모드, 코드, 메탈 스케일까지. 읽고, 지판에서 보고, 퀴즈로 확인해요.' },
  { id: 'technique', title: '테크닉', summary: '피킹·스윕·레가토·태핑. 패턴을 듣고, 메트로놈에 맞춰 BPM을 올리고, 연습 목록에 넣어 복습해요.' },
  { id: 'apply', title: '실전 응용', summary: '배운 음과 손을 음악으로 — 코드톤 타겟팅, 모드로 솔로, 백킹 트랙, 내 곡에 적용.' },
];

export type Level = '입문' | '중급' | '고급';

/** 연습 카드의 단계별 목표 BPM (unit: 몇 분음표 기준인지) */
export interface BpmLevels {
  beginner: number;
  intermediate: number;
  advanced: number;
  unit: string;
}

/**
 * 레슨 내용 블록. 글 안의 **굵게**는 굵은 글씨로 보인다.
 * - text: 제목 + 문단들 (+ 흐린 글씨 메모)
 * - tips: 제목 + 목록
 * - modeTable: 같은 근음으로 7개 모드를 밝기 순서로 비교하는 표
 * - scaleDrill: 3nps 포지션 연습 카드 (모드 고르기, 피킹 방식, 근음 드론)
 * - sweepDrill: 스윕 연습 카드 (키 안의 코드, 인버전)
 * - sweepProgression: 코드 진행을 따라 스윕 모양을 가까운 자리로 잇는 연습 카드
 * - pickingDrill: 피킹 연습 카드 (크로매틱 1-2-3-4 / 스케일 시퀀스)
 */
export type LessonBlock =
  | { type: 'text'; title: string; body: string[]; note?: string }
  | { type: 'tips'; title: string; items: string[] }
  | { type: 'modeTable'; title: string; intro?: string }
  | {
      type: 'scaleDrill';
      title: string;
      intro?: string;
      modes: ModeId[];
      defaultMode: ModeId;
      defaultRoot: number;
      /** 근음 드론을 처음부터 켜 둘지 */
      drone?: boolean;
      /** 레가토로 시작할지 */
      defaultLegato?: boolean;
      levels: BpmLevels;
    }
  | {
      type: 'sweepDrill';
      title: string;
      intro?: string;
      strings: 3 | 4 | 5;
      defaultRoot: number;
      defaultKeyMode: 'ionian' | 'aeolian';
      levels: BpmLevels;
    }
  | { type: 'sweepProgression'; title: string; intro?: string; defaultRoot: number; defaultKeyMode: 'ionian' | 'aeolian'; levels: BpmLevels }
  | {
      type: 'pickingDrill';
      title: string;
      intro?: string;
      exercise: 'chromatic' | 'sequence';
      defaultLegato?: boolean;
      modes?: ModeId[];
      defaultMode?: ModeId;
    };

export interface LessonMeta {
  id: string;
  track: TrackId;
  /** 트랙 안에서의 번호 */
  n: number;
  part: string;
  title: string;
  summary: string;
  topics: string[];
  /** 레슨 화면 맨 위의 한두 문장 */
  intro?: string;
  level?: Level;
  ready: boolean;
  blocks?: LessonBlock[];
}

const SEXTUPLET_LEVELS: BpmLevels = { beginner: 60, intermediate: 90, advanced: 120, unit: '6연음' };

export const LESSONS: LessonMeta[] = [
  // ── 지판과 이론 ─────────────────────
  {
    id: 'fretboard-notes', track: 'theory', n: 1, part: '지판 지도', ready: true, level: '입문',
    title: '지판 음 이름',
    summary: '자연음 7개와 12프렛 반복, 낮은 두 줄부터 외우고 옥타브 모양으로 지판 전체로 넓혀요.',
    topics: ['자연음', '낮은 두 줄', '옥타브 모양', '퀴즈'],
    intro: '리프를 카피할 때도, 파워코드 근음을 찾을 때도, 코드톤에 착지할 때도 전부 ‘이 자리가 무슨 음인지’에서 시작해요. 다 외우려 하지 말고 낮은 두 줄 → 옥타브 모양 순서로 넓혀 가요.',
  },
  {
    id: 'intervals', track: 'theory', n: 2, part: '지판 지도', ready: false, level: '입문',
    title: '음정 모양',
    summary: '반음·온음부터 3도·5도·옥타브까지, 소리와 손 모양으로 거리를 익혀요.',
    topics: ['반음·온음', '3도·5도', '귀로 듣기'],
  },
  {
    id: 'power-chords', track: 'theory', n: 3, part: '지판 지도', ready: false, level: '입문',
    title: '파워코드와 근음',
    summary: '낮은 두 줄 근음으로 파워코드를 바로 잡고, 리프의 코드 이름을 읽어요.',
    topics: ['5도 코드', '드롭 튜닝 한 손가락', '리프 읽기'],
  },
  {
    id: 'scales', track: 'theory', n: 4, part: '스케일', ready: true, level: '입문',
    title: '메이저 스케일과 3nps',
    summary: '온–온–반–온–온–온–반 공식 하나와, 한 줄에 세 음(3nps) 7개 포지션. 속주 솔로의 기본 운지예요.',
    topics: ['스케일 공식', '3nps 7포지션', '나란한조', '얼터네이트·레가토'],
    intro: '모드도, 스윕도, 속주 솔로도 전부 이 7음에서 출발해요. 이론은 짧게, 손은 길게 — 포지션 하나를 메트로놈에 맞춰 깨끗하게 치는 데서 시작해요.',
    blocks: [
      {
        type: 'text',
        title: '1. 공식 하나: 온–온–반–온–온–온–반',
        body: [
          '메이저 스케일은 근음에서 **온음(2칸)–온음–반음(1칸)–온음–온음–온음–반음** 순서로 올라가는 7음이에요. 한 줄 위에서 세면 근음부터 2–2–1–2–2–2–1칸.',
          'G 메이저라면 **G A B C D E F#**. 이 7음을 그대로 두고 다른 음에서 시작하면, 그게 다음 레슨의 **모드**예요.',
        ],
      },
      {
        type: 'text',
        title: '2. 왜 한 줄에 세 음(3nps)인가',
        body: [
          '줄마다 음 수가 같으면 피킹 패턴이 반복돼요. 얼터네이트 피킹이면 한 줄은 **다운–업–다운**, 다음 줄은 **업–다운–업** — 손이 외울 게 하나뿐이라 속도를 올리기 좋아요. 그래서 네오클래식·테크니컬 메탈 솔로의 표준 운지예요.',
          '6연음(한 박에 6음)으로 치면 **두 줄 = 한 박**이라 박과 줄 바꿈이 딱 맞아요. 레가토로 치면 줄마다 **피킹 한 번 + 해머링 두 번**(내려올 때는 풀링 두 번). 아래 연습에서 피킹 방식을 바꿔 보세요.',
        ],
      },
      {
        type: 'scaleDrill',
        title: '3. 7개 포지션',
        intro: '포지션마다 가장 낮은 줄의 시작 음이 달라요. 주황 점이 근음이에요. 하나를 골라 들어 보고, 따라 친 다음 연습 목록에 넣어 두면 복습 일정과 BPM 기록이 쌓여요.',
        modes: ['ionian'],
        defaultMode: 'ionian',
        defaultRoot: 7,
        levels: SEXTUPLET_LEVELS,
      },
      {
        type: 'text',
        title: '4. 같은 7음, 다른 주인공 — 나란한조',
        body: [
          '**G 메이저와 E 마이너는 음이 똑같아요.** G A B C D E F#을 6번째 음 E부터 치면 E F# G A B C D — E 내추럴 마이너(에올리안)예요. 메탈에서 E 마이너 솔로를 친다는 건, G 메이저의 지판 모양 위에서 E를 중심으로 친다는 뜻이에요.',
          '그래서 포지션 7개를 익히면 메이저든 마이너든, 다음 레슨의 모드 7개든 **모양을 새로 외울 필요가 없어요.** 바뀌는 건 어느 음을 중심(근음)으로 듣느냐뿐이에요.',
        ],
      },
      {
        type: 'tips',
        title: '연습법',
        items: [
          '메트로놈은 **6연음 60 BPM**에서 시작해요. 세 번 연속 실수 없이 치면 5 BPM 올려요 — 연습 카드의 ‘자동으로 올리기’가 대신 해 줘요.',
          '박의 첫 음(두 줄마다 한 번)을 클릭에 정확히 맞추세요. 빨라질수록 이 기준점이 먼저 흔들려요.',
          '오른손 손바닥 옆면으로 안 치는 낮은 줄을 덮고, 왼손 남는 손가락으로 높은 줄을 덮어요. 하이게인에서는 **뮤트가 곧 실력**이에요.',
          '막히면 더 올리지 말고 10 BPM 내려서 힘을 빼고 쳐요. 긴장한 채 반복하면 긴장이 손에 붙어요.',
        ],
      },
    ],
  },
  {
    id: 'modes', track: 'theory', n: 5, part: '스케일', ready: true, level: '중급',
    title: '모드 7개',
    summary: '메이저 스케일의 7음을 다른 음에서 시작하면 7가지 색. 메탈의 에올리안·프리지안·로크리안을 근음 위에서 들어 봐요.',
    topics: ['밝기 순서', '특징음', '프리지안·로크리안', '근음 드론'],
    intro: '모드는 새 스케일을 외우는 게 아니라, 같은 7음에서 **어느 음을 근음으로 들리게 하느냐**예요. 그래서 꼭 근음이 계속 울리는 위에서 들어야 차이가 들려요.',
    blocks: [
      {
        type: 'text',
        title: '1. 같은 7음, 7개의 시작점',
        body: [
          '메이저 스케일의 1번째 음부터 치면 **이오니안**, 2번째부터 **도리안**, 3번째 **프리지안**, 4번째 **리디안**, 5번째 **믹솔리디안**, 6번째 **에올리안**, 7번째 **로크리안**이에요. C 메이저의 음(피아노 흰건반)만 쓰되 E부터 E까지 치면 E 프리지안이라는 뜻이에요.',
          '연주에 더 쓸모 있는 건 **같은 근음으로 7개를 비교**하는 방법이에요. 아래 표는 근음 하나로 7개 모드를 밝은 순서대로 놓은 거예요. 한 줄 내려갈 때마다 **딱 한 음씩 반음 내려가요.**',
        ],
      },
      {
        type: 'modeTable',
        title: '2. 밝은 순서로 보는 7개 모드',
        intro: '주황 도수가 그 모드의 특징음 — 이 음을 강조해야 그 모드처럼 들려요.',
      },
      {
        type: 'scaleDrill',
        title: '3. 근음 위에서 들어 보기',
        intro: '근음 드론을 켜 두고 같은 근음에서 모드만 바꿔 들어 보세요. 직접 칠 때는 특징음에서 잠깐 멈추면 그 모드의 색이 바로 들려요.',
        modes: ['lydian', 'ionian', 'mixolydian', 'dorian', 'aeolian', 'phrygian', 'locrian'],
        defaultMode: 'phrygian',
        defaultRoot: 4,
        drone: true,
        levels: SEXTUPLET_LEVELS,
      },
      {
        type: 'text',
        title: '4. 메탈에서 자주 쓰는 셋',
        body: [
          '**에올리안** — 메탈의 기본 마이너. Em–C–D(i–VI–VII) 같은 진행 위의 솔로는 대부분 이 모드예요.',
          '**프리지안** — 근음 바로 위의 반음(b2). E 페달 리프에 F를 섞는 순간 스래시·데스 메탈 소리가 나요. 6번 줄 개방과 1프렛을 오가는 리프가 대표적이에요.',
          '**로크리안** — b2에 b5까지. 근음 코드조차 안정되지 않아서 가장 불길하게 들려요. 근음과 b5(트라이톤)를 번갈아 치는 리프로 많이 써요.',
        ],
        note: 'b2에 메이저 3도가 들어간 프리지안 도미넌트(중동풍 메탈)는 하모닉 마이너에서 나오는 모드라 ‘메탈 스케일’ 레슨에서 다뤄요.',
      },
      {
        type: 'tips',
        title: '연습법',
        items: [
          '하루에 모드 하나. 그 모드로 4마디짜리 짧은 프레이즈를 만들어 **특징음에서 끝내** 보세요.',
          '내 라이브러리 곡이 E 마이너라면, 같은 E 근음으로 에올리안 → 프리지안 → 로크리안으로 바꿔 치며 분위기가 어떻게 어두워지는지 들어 보세요.',
          '모드 이름보다 **도수**(b2, #4, b6 …)로 기억하는 게 실전에서 빨라요.',
        ],
      },
    ],
  },
  {
    id: 'pentatonic', track: 'theory', n: 6, part: '스케일', ready: false, level: '입문',
    title: '펜타토닉 5개 포지션',
    summary: '다섯 상자를 이어 지판 전체를 오르내려요. 솔로의 출발점.',
    topics: ['박스 1–5', '포지션 잇기', '블루 노트'],
  },
  {
    id: 'chord-tones', track: 'theory', n: 7, part: '코드', ready: false, level: '중급',
    title: '코드 구성음',
    summary: '근음·3도·5도·7도 — 플레이어 지판의 색과 같은 체계로 코드 속을 들여다봐요.',
    topics: ['R·3·5·7', '메이저 vs 마이너', '파워코드엔 3도가 없다'],
  },
  {
    id: 'diatonic', track: 'theory', n: 8, part: '코드', ready: false, level: '중급',
    title: '키 안의 코드와 로마숫자',
    summary: 'i–VI–VII, V의 긴장 — 분석 화면의 로마숫자가 무슨 뜻인지 읽어요.',
    topics: ['다이어토닉 코드', '로마숫자', '빌려 온 코드'],
  },
  {
    id: 'metal-scales', track: 'theory', n: 9, part: '메탈', ready: false, level: '고급',
    title: '메탈 스케일',
    summary: '하모닉 마이너, 프리지안 도미넌트, 디미니시드 — 어둡고 이국적인 소리의 정체.',
    topics: ['하모닉 마이너', '프리지안 도미넌트', '디미니시드'],
  },

  // ── 테크닉 ─────────────────────────
  {
    id: 'alternate-picking', track: 'technique', n: 1, part: '피킹', ready: true, level: '입문',
    title: '얼터네이트 피킹',
    summary: '다운–업을 끊지 않는 오른손 규칙, 크로매틱 1-2-3-4, 줄 넘기기(안쪽·바깥쪽), 스케일 시퀀스. 모든 속주의 바탕.',
    topics: ['다운–업', '크로매틱', '안쪽·바깥쪽 피킹', '4음 시퀀스'],
    intro: '모든 속주의 바탕은 **다운–업을 쉬지 않고 번갈아 치는 것**이에요. 음이 바뀌어도, 줄이 바뀌어도 오른손의 다운–업 순서는 깨지지 않아요.',
    blocks: [
      {
        type: 'text',
        title: '1. 오른손 규칙',
        body: [
          '박의 앞(정박)은 **다운**, 뒤(엇박)는 **업** — 16분음표라면 다운–업–다운–업이 박마다 되풀이돼요. 쉬는 음이 있어도 손은 허공에서 그 순서대로 계속 움직여요.',
          '피크는 줄에 끝만 살짝(1–2mm) 걸치고, 움직임은 손목(또는 엄지·검지)에서 작게. 피크가 크게 움직일수록 빠른 속도에서 무너져요. 팜뮤트를 살짝 걸고 연습하면 잡음이 줄고, 메탈 리프의 타이트한 소리와도 바로 이어져요.',
        ],
      },
      {
        type: 'pickingDrill',
        title: '2. 크로매틱 1-2-3-4 (손 풀기)',
        intro: '한 줄에 네 음, 손가락 하나에 한 프렛. 왼손이 누르는 순간과 피크가 치는 순간을 맞추는 가장 기본 연습이에요. 시작 프렛을 바꿔 지판 위아래에서 쳐 보세요.',
        exercise: 'chromatic',
      },
      {
        type: 'text',
        title: '3. 줄 넘기기: 안쪽과 바깥쪽',
        body: [
          '줄을 옮길 때 피크가 두 줄 **사이에서** 오가면 안쪽(inside) 피킹, 두 줄의 **바깥을 돌아** 넘으면 바깥쪽(outside) 피킹이에요. 굵은 줄을 다운, 가는 줄을 업으로 이어 치면 안쪽 / 굵은 줄을 업, 가는 줄을 다운으로 이어 치면 바깥쪽.',
          '어느 쪽이 나오는지는 한 줄에 치는 음 수가 정해요. 한 줄에 **네 음**(짝수)이면 올라갈 때는 늘 바깥쪽, 내려올 때는 늘 안쪽. **3nps**(홀수)는 줄마다 안쪽·바깥쪽이 번갈아 나와요. 둘 다 손에 익어야 어떤 프레이즈든 칠 수 있어요.',
        ],
      },
      {
        type: 'pickingDrill',
        title: '4. 스케일 시퀀스',
        intro: '스케일을 네 음(또는 세 음)씩 묶어 한 음씩 밀어 올라가는 패턴이에요. 같은 포지션 안에서 줄 넘기기가 쉬지 않고 나와서, 실전 속주 솔로에 가장 가까운 연습이에요.',
        exercise: 'sequence',
      },
      {
        type: 'tips',
        title: '연습법',
        items: [
          '처음 2주는 속도보다 **동기화**. 메트로놈을 느리게 두고, 왼손이 누르는 순간과 피크가 줄을 치는 순간이 정확히 같은지 들어요.',
          '세 번 연속 깨끗하면 5 BPM 올리고, 틀리기 시작하면 10 BPM 내려서 힘을 빼요. ‘자동으로 올리기’를 켜 두면 BPM을 대신 올려 줘요.',
          '하루 10분이라도 매일. 속주는 몰아서 하는 것보다 매일 짧게 하는 쪽이 훨씬 빨리 늘어요.',
          '연습 목록에 넣고 복습할 때 그날 친 BPM을 적어 두세요. 목표까지 얼마나 왔는지 보여요.',
        ],
      },
    ],
  },
  {
    id: 'sweep-3', track: 'technique', n: 2, part: '스윕', ready: true, level: '중급',
    title: '스윕 3줄 트라이어드',
    summary: '1·2·3번 줄에서 메이저·마이너·디미니시드 트라이어드를 쓸어 치기. 인버전 3개와 키 안의 코드 7개.',
    topics: ['미는 피킹', '롤링·뮤트', '인버전 3개', '키 안의 코드'],
    intro: '스윕은 줄마다 따로 치는 게 아니라 피크를 **한 번에 밀어 내리듯** 지나가는 기술이에요. 음이 섞여 코드처럼 울리면 실패, 한 음씩 또렷하면 성공. 3줄을 정확하게 익히면 4·5줄은 같은 동작을 넓히기만 하면 돼요.',
    blocks: [
      {
        type: 'text',
        title: '1. 동작: 미는 피킹',
        body: [
          '높은 줄로 올라갈 때는 **다운 스트로크 한 번**으로 3번–2번–1번 줄을 차례로 지나가요. 줄마다 피크를 멈췄다 다시 치는 게 아니라, 다음 줄에 피크를 기대 두었다가 밀어 넘기는 느낌이에요. 내려올 때는 반대로 **업 스트로크 한 번**.',
          '맨 위 1번 줄에서는 두 음을 쳐요. 첫 음은 피킹, 두 번째는 **해머링**(또는 슬라이드), 내려올 때는 **풀링**으로 돌아와서 업 스윕으로 이어 가요.',
        ],
      },
      {
        type: 'text',
        title: '2. 깨끗한 소리: 롤링과 뮤트',
        body: [
          '두 줄에 같은 프렛이 이어지면(예: 3번 줄 14, 2번 줄 14) 손가락 하나로 **굴리듯(롤링)** 눌러요. 다음 줄로 넘어가는 순간 앞 줄은 손가락 힘을 빼서 소리를 끊어요.',
          '오른손 손바닥으로 이미 친 줄을 바로 덮어요. 하이게인에서는 아르페지오가 코드처럼 뭉개지는 게 가장 흔한 실수예요. **녹음해서 들어 보는 게 제일 정확한 확인**이에요.',
        ],
      },
      {
        type: 'text',
        title: '3. 인버전 3개',
        body: [
          '트라이어드는 근음·3도·5도 세 음이에요. 가장 낮은 음을 무엇으로 두느냐에 따라 **기본형(R–3–5) / 1전위(3–5–R) / 2전위(5–R–3)** — 같은 코드를 지판 세 곳에서 칠 수 있어요.',
          '메이저와 마이너는 **3도 한 칸**, 마이너와 디미니시드는 **5도 한 칸** 차이예요. 지판 점의 도수 표시를 보며 어느 손가락이 움직이는지 확인해 보세요.',
        ],
      },
      {
        type: 'sweepDrill',
        title: '4. 키 안의 코드로 연습',
        intro: '키를 고르면 그 키의 코드 7개가 나와요. 메이저 키는 메이저 스케일에서, 마이너 키는 에올리안에서 나온 코드예요. 코드를 골라 인버전 하나씩, 또는 셋을 이어서 쳐 보세요.',
        strings: 3,
        defaultRoot: 4,
        defaultKeyMode: 'aeolian',
        levels: SEXTUPLET_LEVELS,
      },
      {
        type: 'tips',
        title: '연습법',
        items: [
          '처음엔 메트로놈 없이 아주 천천히, 한 음씩 끊어서 쳐요. 음이 겹치지 않는 걸 확인한 다음 6연음 50–60 BPM으로.',
          '박의 첫 음에 악센트를 줘요. 스윕은 빨라질수록 앞으로 쏠리기 쉬워서 첫 음이 기준점이에요.',
          '키 안의 코드를 진행 순서로 이어 쳐 보세요. E 마이너라면 **Em → C → D**(i–VI–VII). 코드마다 연습 목록에 넣어 두면 복습할 때 번갈아 나와요.',
        ],
      },
    ],
  },
  {
    id: 'sweep-45', track: 'technique', n: 3, part: '스윕', ready: true, level: '고급',
    title: '스윕 4·5줄',
    summary: '4줄 16분음표 모양, 5번 줄에서 시작하는 5줄 모양. 3줄 동작을 넓히기.',
    topics: ['4줄 모양', '5줄 모양', '양 끝 레가토'],
    intro: '3줄 스윕의 동작을 그대로 넓혀요. 줄이 늘면 피크가 지나가는 거리가 길어지니, 손목을 튕기지 말고 **팔 전체가 일정한 속도로 미끄러지는** 느낌이 중요해요.',
    blocks: [
      {
        type: 'text',
        title: '1. 4줄: 16분음표 모양',
        body: [
          '4번 줄부터 1번 줄까지 한 줄에 한 음씩 올라가고, 1번 줄에서 두 음. 한 바퀴가 8음이라 **16분음표 두 박**에 딱 맞아요(3줄·5줄은 6연음).',
          '4줄 모양의 위 세 줄만 보면 **3줄 모양 중 하나**예요. 거기에 4번 줄의 화음 음 하나를 더한 것 — 이미 익힌 3줄 모양을 찾아보면 금방 외워져요. 근음(주황)의 자리부터 확인하세요.',
        ],
      },
      {
        type: 'sweepDrill',
        title: '2. 4줄 연습',
        intro: '키 안의 코드를 골라 인버전 하나씩, 또는 셋을 이어서 쳐 보세요. ‘3개 이어서’를 고르면 재생하는 동안 지판이 지금 치는 모양을 보여 줘요.',
        strings: 4,
        defaultRoot: 4,
        defaultKeyMode: 'aeolian',
        levels: { beginner: 80, intermediate: 120, advanced: 160, unit: '16분음표' },
      },
      {
        type: 'text',
        title: '3. 5줄: 양 끝에서 레가토',
        body: [
          '5번 줄에서 첫 음을 치고 **해머링으로 다음 음**, 4·3·2번 줄을 한 음씩 쓸고, 1번 줄에서 두 음. 내려올 때는 1번 줄 풀링 → 업 스윕 → 5번 줄에서 풀링으로 돌아와요. 한 바퀴 12음, **6연음 두 박**이에요.',
          '메이저 기본형은 손을 5–6칸 벌려야 해요. 처음엔 12프렛 근처(프렛 간격이 좁은 곳)에서 시작하고, 손이 익으면 낮은 자리로 내려오세요.',
        ],
      },
      {
        type: 'sweepDrill',
        title: '4. 5줄 연습',
        intro: '5줄 모양은 네오클래식 메탈 솔로의 상징 같은 소리예요. 한 모양을 정확하게 익힌 다음 같은 키의 다른 코드로 옮겨 가요.',
        strings: 5,
        defaultRoot: 4,
        defaultKeyMode: 'aeolian',
        levels: SEXTUPLET_LEVELS,
      },
      {
        type: 'tips',
        title: '연습법',
        items: [
          '줄이 늘수록 박의 첫 음이 밀리기 쉬워요. 5줄은 한 바퀴 12음 = 2박이라, **5번 줄 첫 음과 꼭대기 음**이 박의 시작이에요. 여기에 클릭을 맞춰요.',
          '소리가 뭉개지면 드라이브를 끄고 클린으로 연습해 보세요. 클린에서 깨끗해야 드라이브에서도 깨끗해요.',
          '같은 코드를 3줄 → 4줄 → 5줄 모양으로 번갈아 치면 세 모양이 지판 위에서 하나로 연결돼요.',
        ],
      },
    ],
  },
  {
    id: 'sweep-diatonic', track: 'technique', n: 4, part: '스윕', ready: true, level: '고급',
    title: '코드 진행 따라 스윕',
    summary: 'i–VI–VII 같은 메탈 진행과 키 안의 코드 7개를 스윕으로 이어 치기. 다음 코드를 가장 가까운 자리에서.',
    topics: ['가까운 자리로 잇기', '메탈 진행', '다이어토닉 순환'],
    intro: '코드 진행을 따라 스윕 모양을 바꿔 가는 연습이에요. 네오클래식 메탈 솔로에서 듣는 그 소리 — 핵심은 **다음 코드를 가장 가까운 자리에서** 잡는 거예요.',
    blocks: [
      {
        type: 'text',
        title: '1. 가까운 자리로 잇기',
        body: [
          '같은 코드도 인버전에 따라 지판 세 곳에 있어요. 코드가 바뀔 때 손이 멀리 뛰지 않도록, 아래 연습은 **앞 코드와 손 위치가 가장 가까운 인버전**을 골라 이어 줘요(지판 가운데 3–15프렛 안에서).',
          '두 코드에 같이 들어 있는 음(공통음)이 같은 자리에 남는 경우가 많아요. 그 손가락을 기준점 삼아 나머지 손가락만 옮겨요.',
        ],
      },
      {
        type: 'sweepProgression',
        title: '2. 진행 고르고 연습하기',
        intro: '코드마다 한 마디씩, 재생하는 동안 지판이 지금 코드의 모양을 보여 줘요. 멈춘 상태에서는 마디 단추를 눌러 모양을 하나씩 확인할 수 있어요.',
        defaultRoot: 4,
        defaultKeyMode: 'aeolian',
        levels: SEXTUPLET_LEVELS,
      },
      {
        type: 'text',
        title: '3. 메탈에서 자주 쓰는 진행',
        body: [
          '**i–VI–VII–i**(Em–C–D–Em): 가장 흔한 메탈 진행. **i–VI–III–VII**(Em–C–G–D): 서사적인 파워 메탈. **i–iv–v–i**(Em–Am–Bm–Em): 어둡고 무거운 마이너.',
          '**순서대로 7개**는 키 안의 코드를 모두 지나가는 스케일 같은 연습이에요. 디미니시드(ii°)가 특히 손에 안 익으니 그 마디만 따로 천천히 쳐 보세요.',
        ],
        note: '하모닉 마이너의 V(메이저 코드)로 가는 네오클래식 진행(i–iv–V–i)은 ‘메탈 스케일’ 레슨 다음에 다뤄요.',
      },
      {
        type: 'tips',
        title: '연습법',
        items: [
          '처음엔 코드가 바뀌는 순간만 반복해요. 마디 끝 두 박 + 다음 마디 첫 박을 느리게, 손이 미리 다음 자리로 가 있도록.',
          '3줄로 진행 전체를 익힌 다음 같은 진행을 5줄로. 줄 수만 바꿔도 손 위치는 거의 그대로예요.',
          '백킹 대신 근음을 입으로 세며 쳐 보세요. 지금 무슨 코드를 치는지 알고 치는 게 즉흥으로 가는 첫걸음이에요.',
        ],
      },
    ],
  },
  {
    id: 'legato', track: 'technique', n: 5, part: '레가토·태핑', ready: true, level: '중급',
    title: '레가토 3nps',
    summary: '피킹 한 번에 세 음. 해머링·풀링의 음량을 피킹과 같게 맞추고, 시퀀스로 넓히기.',
    topics: ['해머링·풀링', '음량 고르기', '3음 시퀀스'],
    intro: '피킹은 줄마다 첫 음에 한 번, 나머지는 왼손으로. 레가토의 목표는 **해머링·풀링 음이 피킹한 음만큼 크고 고르게** 들리는 거예요.',
    blocks: [
      {
        type: 'text',
        title: '1. 해머링과 풀링',
        body: [
          '해머링은 손가락 끝을 프렛 바로 뒤에 **위에서 내리꽂듯**, 풀링은 그냥 떼는 게 아니라 줄을 **바닥 쪽으로 살짝 뜯으며** 떼야 소리가 나요.',
          '쓰지 않는 줄은 오른손 손바닥과 왼손 검지 옆면으로 덮어요. 하이게인에서 레가토는 피킹이 적은 만큼 잡음이 그대로 드러나요.',
        ],
      },
      {
        type: 'scaleDrill',
        title: '2. 3nps 레가토',
        intro: '줄마다 피킹 한 번 + 해머링 두 번(내려올 때는 풀링 두 번). 6연음이면 한 박에 두 줄이라, 줄이 바뀌는 첫 음에만 피킹하면 박이 자연스럽게 맞아요.',
        modes: ['aeolian', 'phrygian', 'dorian', 'ionian'],
        defaultMode: 'aeolian',
        defaultRoot: 4,
        defaultLegato: true,
        levels: SEXTUPLET_LEVELS,
      },
      {
        type: 'pickingDrill',
        title: '3. 시퀀스 레가토',
        intro: '3음 시퀀스를 레가토로. 같은 줄에서 이어지는 음은 해머링·풀링, 줄이 바뀌면 피킹해요. 방향이 계속 바뀌어서 해머링과 풀링이 고르게 섞여요.',
        exercise: 'sequence',
        defaultLegato: true,
      },
      {
        type: 'tips',
        title: '연습법',
        items: [
          '피킹한 음과 해머링·풀링 음의 크기 차이가 들리면 느리게. 드라이브를 끄고 클린으로 들으면 차이가 잘 들려요.',
          '풀링하고 다음 줄로 넘어갈 때 앞 줄이 울리지 않게, 방금 뗀 손가락으로 줄을 살짝 덮어요.',
          '힘이 아니라 정확한 위치(프렛 바로 뒤)가 소리를 만들어요. 손가락이 아프면 쉬세요.',
        ],
      },
    ],
  },
  {
    id: 'tapping', track: 'technique', n: 6, part: '레가토·태핑', ready: false, level: '고급',
    title: '태핑',
    summary: '오른손 한 손가락 태핑으로 트라이어드와 스케일을 넓은 음역으로.',
    topics: ['태핑 + 풀링', '트라이어드 태핑', '노이즈 뮤트'],
  },
  {
    id: 'string-skipping', track: 'technique', n: 7, part: '피킹', ready: false, level: '고급',
    title: '스트링 스키핑',
    summary: '줄을 건너뛰어 넓은 음정 — 아르페지오를 스윕 없이 피킹으로.',
    topics: ['한 줄 건너기', '넓은 음정 아르페지오'],
  },
  {
    id: 'bending-vibrato', track: 'technique', n: 8, part: '표현', ready: false, level: '중급',
    title: '벤딩·비브라토',
    summary: '반음·온음 벤딩을 정확한 음정으로, 비브라토 폭과 속도 고르기.',
    topics: ['음정 맞추기', '비브라토', '릴리즈'],
  },
  {
    id: 'gallop', track: 'technique', n: 9, part: '리듬', ready: false, level: '중급',
    title: '팜뮤트 갤럽 리프',
    summary: '다운–다운–다운 갤럽과 셋잇단 리프. 오른손 지구력과 타이트함.',
    topics: ['갤럽', '팜뮤트 깊이', '다운 피킹 지구력'],
  },

  // ── 실전 응용 ───────────────────────
  {
    id: 'targeting', track: 'apply', n: 1, part: '코드와 솔로', ready: false, level: '중급',
    title: '코드톤 타겟팅',
    summary: '코드가 바뀌는 순간 3도에 착지하기. 백킹 트랙 위에서 연습해요.',
    topics: ['착지음', '3도 잡기', '백킹 트랙'],
  },
  {
    id: 'modal-solo', track: 'apply', n: 2, part: '코드와 솔로', ready: false, level: '고급',
    title: '모드로 솔로하기',
    summary: '코드 진행에 맞는 모드를 고르고, 특징음으로 색을 내는 솔로.',
    topics: ['모드 고르기', '특징음 강조', '프레이즈'],
  },
  {
    id: 'backing', track: 'apply', n: 3, part: '즉흥', ready: false, level: '중급',
    title: '백킹 트랙 즉흥',
    summary: '메탈 진행 위에서 배운 포지션과 스윕을 섞어 즉흥으로.',
    topics: ['i–VI–VII', '포지션 잇기', '리듬 변화'],
  },
  {
    id: 'my-songs', track: 'apply', n: 4, part: '즉흥', ready: false, level: '중급',
    title: '내 곡에 적용',
    summary: '라이브러리 곡의 키와 코드 위에서 오늘 배운 패턴을 써 보기.',
    topics: ['곡의 키', '코드 흐름', '카피 → 변형'],
  },
];

export const lessonById = (id: string | undefined) => LESSONS.find((l) => l.id === id) ?? null;
export const trackById = (id: TrackId) => TRACKS.find((t) => t.id === id)!;
