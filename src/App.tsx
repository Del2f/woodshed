import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { Library } from './pages/Library';
import { Player, PlayerLanding } from './pages/Player';
import { Metronome } from './pages/Metronome';
import { Tuner } from './pages/Tuner';
import { Settings } from './pages/Settings';
import { Engine } from './pages/Engine';
import { ComingSoon } from './pages/ComingSoon';
import { Licks } from './pages/Licks';
import { Review } from './pages/Review';
import { TabEditor } from './pages/TabEditor';
import { Tabs } from './pages/Tabs';

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
            <Route path="/tabs" element={<Tabs />} />
            <Route path="/tabs/:lickId" element={<TabEditor />} />
            <Route path="/licks" element={<Licks />} />
            <Route path="/licks/review" element={<Review />} />
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
