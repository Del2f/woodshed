import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { Library } from './pages/Library';
import { Player, PlayerLanding } from './pages/Player';
import { Metronome } from './pages/Metronome';
import { Tuner } from './pages/Tuner';
import { Settings } from './pages/Settings';
import { Engine } from './pages/Engine';
import { Licks } from './pages/Licks';
import { Review } from './pages/Review';
import { TabEditor } from './pages/TabEditor';
import { Tabs } from './pages/Tabs';
import { Learn, Lesson } from './pages/Learn';

export function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  );
}

/** 플레이어는 화면을 넓게 쓰도록 메뉴를 아이콘만 남긴다 */
function Shell() {
  const wide = /^\/player\/./.test(useLocation().pathname);
  return (
    <div className={`app${wide ? ' wide' : ''}`}>
      <Sidebar compact={wide} />
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
          <Route path="/learn" element={<Learn />} />
          <Route path="/learn/:lessonId" element={<Lesson />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
