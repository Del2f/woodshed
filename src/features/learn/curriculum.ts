/** 이론 커리큘럼 9개 레슨. ready가 아닌 레슨은 목록에 '준비 중'으로만 보인다 */

export interface LessonMeta {
  id: string;
  n: number;
  part: string;
  title: string;
  summary: string;
  topics: string[];
  /** 레슨 화면 맨 위의 한두 문장 */
  intro?: string;
  ready: boolean;
}

export const LESSONS: LessonMeta[] = [
  {
    id: 'fretboard-notes', n: 1, part: '지판 지도', ready: true,
    title: '지판 음 이름',
    summary: '자연음 7개와 12프렛 반복, 낮은 두 줄부터 외우고 옥타브 모양으로 지판 전체로 넓혀요.',
    topics: ['자연음', '낮은 두 줄', '옥타브 모양', '퀴즈'],
    intro: '리프를 카피할 때도, 파워코드 근음을 찾을 때도, 코드톤에 착지할 때도 전부 ‘이 자리가 무슨 음인지’에서 시작해요. 다 외우려 하지 말고 낮은 두 줄 → 옥타브 모양 순서로 넓혀 가요.',
  },
  {
    id: 'intervals', n: 2, part: '지판 지도', ready: false,
    title: '음정 모양',
    summary: '반음·온음부터 3도·5도·옥타브까지, 소리와 손 모양으로 거리를 익혀요.',
    topics: ['반음·온음', '3도·5도', '귀로 듣기'],
  },
  {
    id: 'power-chords', n: 3, part: '지판 지도', ready: false,
    title: '파워코드와 근음',
    summary: '낮은 두 줄 근음으로 파워코드를 바로 잡고, 리프의 코드 이름을 읽어요.',
    topics: ['5도 코드', '드롭 튜닝 한 손가락', '리프 읽기'],
  },
  {
    id: 'scales', n: 4, part: '스케일', ready: false,
    title: '메이저·마이너 스케일',
    summary: '키의 뼈대가 되는 두 스케일과 나란한조. 내 곡의 키로 바로 쳐 봐요.',
    topics: ['온음·반음 순서', '나란한조', '내 곡의 키'],
  },
  {
    id: 'pentatonic', n: 5, part: '스케일', ready: false,
    title: '펜타토닉 5개 포지션',
    summary: '다섯 상자를 이어 지판 전체를 오르내려요. 솔로의 출발점.',
    topics: ['박스 1–5', '포지션 잇기', '블루 노트'],
  },
  {
    id: 'chord-tones', n: 6, part: '코드와 솔로', ready: false,
    title: '코드 구성음',
    summary: '근음·3도·5도·7도 — 플레이어 지판의 색과 같은 체계로 코드 속을 들여다봐요.',
    topics: ['R·3·5·7', '메이저 vs 마이너', '파워코드엔 3도가 없다'],
  },
  {
    id: 'diatonic', n: 7, part: '코드와 솔로', ready: false,
    title: '키 안의 코드와 로마숫자',
    summary: 'i–VI–VII, V의 긴장 — 분석 화면의 로마숫자가 무슨 뜻인지 읽어요.',
    topics: ['다이어토닉 코드', '로마숫자', '빌려 온 코드'],
  },
  {
    id: 'targeting', n: 8, part: '코드와 솔로', ready: false,
    title: '코드톤 타겟팅',
    summary: '코드가 바뀌는 순간 3도에 착지하기. 백킹 트랙 위에서 연습해요.',
    topics: ['착지음', '3도 잡기', '백킹 트랙'],
  },
  {
    id: 'metal-scales', n: 9, part: '메탈', ready: false,
    title: '메탈 스케일',
    summary: '하모닉 마이너, 프리지안, 프리지안 도미넌트 — 어둡고 이국적인 소리의 정체.',
    topics: ['하모닉 마이너', '프리지안', '프리지안 도미넌트'],
  },
];

export const lessonById = (id: string | undefined) => LESSONS.find((l) => l.id === id) ?? null;
