import { useState } from 'react';
import { Icon } from '../components/Icon';
import { DEFAULT_ENGINE_URL, engineUrl, setEngineUrl, useEngine } from '../lib/engine';

export function Engine() {
  const { health, checked, refresh } = useEngine(4000);
  const [url, setUrl] = useState(engineUrl());

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <header className="page-head">
        <div>
          <span className="eyebrow">분석 엔진</span>
          <h1 className="title-xl">내 PC에서 돌아가는 분석기</h1>
          <p className="lead">박자·키·코드를 찾고, 원하면 기타 트랙을 따로 분리해요. 음원은 이 PC 밖으로 나가지 않아요.</p>
        </div>
      </header>

      <section className={`card lg${health ? '' : ' accent'}`}>
        <div className="card-head">
          <h2 className="title-s">상태</h2>
          <span className="status-line">
            <span className={`dot ${health ? 'green' : ''}`} />
            {!checked ? '확인 중…' : health ? `연결됨 · v${health.version}` : '꺼져 있음'}
          </span>
        </div>
        {health ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 24px', fontSize: 15 }}>
            <span className="muted">박자·키·코드</span>
            <span>사용 가능</span>
            <span className="muted">기타 분리</span>
            <span>{health.features.separation ? '사용 가능' : '미설치 — 아래 3번 참고'}</span>
            <span className="muted">GPU</span>
            <span>{health.features.gpu ?? (health.features.separation ? '없음 (CPU로 분리, 곡당 몇 분)' : '—')}</span>
          </div>
        ) : (
          <p className="lead" style={{ fontSize: 14 }}>
            엔진이 꺼져 있어도 구간 반복·메트로놈·튜너는 그대로 쓸 수 있어요. 분석할 때만 켜 두면 돼요.
          </p>
        )}
        <button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={refresh}>
          다시 확인
        </button>
      </section>

      <section className="card lg">
        <h2 className="title-s">켜는 방법</h2>
        <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 14, lineHeight: 1.7, color: 'var(--text-2)' }}>
          <li>
            <strong>처음 한 번:</strong> 저장소를 PC에 받아요. GitHub 저장소 페이지의 <span className="mono">Code → Download ZIP</span>이나
            <div className="mono" style={{ marginTop: 6, padding: '10px 14px', borderRadius: 10, background: 'var(--surface-2)', fontSize: 13 }}>
              git clone https://github.com/Del2f/woodshed.git
            </div>
            <span className="muted" style={{ fontSize: 13 }}>Python 3.10 이상이 필요해요 (python.org).</span>
          </li>
          <li>
            <span className="mono">woodshed/engine/start.bat</span>을 더블클릭하세요. 처음엔 필요한 패키지를 설치하느라 몇 분 걸리고, 그다음부터는 바로 켜져요. 검은 창이 열려 있는 동안 엔진이
            동작해요.
          </li>
          <li>
            <strong>(선택) 기타 분리:</strong> <span className="mono">install-separation.bat</span>을 한 번 실행하면 Demucs가 설치돼요 (약 3GB). NVIDIA 그래픽카드가 있으면 곡당
            10~20초면 끝나요.
          </li>
          <li>
            처음 분석할 때 Chrome이 <strong>“로컬 네트워크의 기기에 접근”</strong> 권한을 물어보면 <strong>허용</strong>을 눌러 주세요. 이 사이트가 내 PC의 엔진(127.0.0.1)과
            대화하려면 필요해요.
          </li>
        </ol>
      </section>

      <section className="card lg">
        <h2 className="title-s">고급 설정</h2>
        <form
          style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
          onSubmit={(e) => {
            e.preventDefault();
            setEngineUrl(url.trim());
            refresh();
          }}
        >
          <label className="field" style={{ flex: '1 1 280px' }}>
            <span>엔진 주소</span>
            <input className="input mono" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={DEFAULT_ENGINE_URL} />
          </label>
          <button type="submit" className="btn" style={{ alignSelf: 'flex-end' }}>
            <Icon name="check" size={16} />
            저장
          </button>
        </form>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          보통은 바꿀 필요가 없어요. 엔진 포트를 바꿨다면(<span className="mono">WOODSHED_PORT</span>) 여기에 맞춰 주세요.
        </p>
      </section>
    </div>
  );
}
