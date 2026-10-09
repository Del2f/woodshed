import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { Library } from './pages/Library';
import { Player, PlayerLanding } from './pages/Player';
import { Metronome } from './pages/Metronome';
import { Tuner } from './pages/Tuner';
import { Settings } from './pages/Settings';
import { Engine } from './pages/Engine';
import { ComingSoon } from './pages/ComingSoon';

export function App() {
  return (
    <HashRouter>
      <div className="app">
        <Sidebar />
        <main className="main">
          <Routes>
            <Route path="/" element={<Library />} />
            <Route path="/player" element={<PlayerLanding />} />
            <Route path="/player/:songId" element={<Player />} />
            <Route path="/metronome" element={<Metronome />} />
            <Route path="/tuner" element={<Tuner />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/engine" element={<Engine />} />
            <Route
              path="/tabs"
              element={
                <ComingSoon
                  eyebrow="타브 에디터"
                  title="음원에서 만든 타브를 고치고 저장해요"
                  version="v0.3"
                  points={['로컬 분석 엔진이 만든 타브 초안 불러오기', '인식이 불확실한 음 표시와 원곡 비교 재생', '주법 기호 입력, Guitar Pro 가져오기·내보내기']}
                />
              }
            />
            <Route
              path="/licks"
              element={
                <ComingSoon
                  eyebrow="릭 보관함"
                  title="카피한 건, 잊지 않게"
                  version="v0.3"
                  points={['플레이어 구간·타브에서 바로 릭으로 저장', '태그·즐겨찾기·BPM 기록', '잊을 때쯤 다시 꺼내 주는 간격 반복 복습']}
                />
              }
            />
            <Route
              path="/learn"
              element={
                <ComingSoon
                  eyebrow="이론 커리큘럼"
                  title="손은 이미 알아요. 이름만 붙이면 돼요"
                  version="v0.4"
                  points={['지판 음 이름부터 코드톤 타겟팅, 메탈 스케일까지 9개 레슨', '내 라이브러리의 곡을 예제로 연결', '퀴즈와 백킹 트랙 연습']}
                />
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
