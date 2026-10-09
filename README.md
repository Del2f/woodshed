# Woodshed 🎸

일렉기타 개인 연습실. 내 음원으로 구간 반복 연습을 하고, 연습 기록이 사라지지 않게 클라우드에 저장합니다.

> *woodshed*: 영어권 연주자들이 "혼자 틀어박혀 연습한다"는 뜻으로 쓰는 속어

## v0.1에서 되는 것

| 기능 | 내용 |
|---|---|
| **라이브러리** | PC의 음원 폴더를 연결해 곡 추가, 이어서 연습, 이번 주 연습 시간·연속 일수 |
| **플레이어** | 파형 드래그로 A-B 구간 반복, 음정 유지 속도 조절(25~150%), 스피드 트레이너, 구간 이름 붙여 저장(속도 포함), 마지막 구간 자동 복원, 연습 시간 자동 기록 |
| **메트로놈** | Web Audio 예약 방식(박이 밀리지 않음), 2/4~7/4, 4분·8분·셋잇단·16분, 첫 박 강세, 탭 템포 |
| **튜너** | 마이크 음 인식(McLeod 방식), Standard·Eb·Drop D/C/B·7현 프리셋, A4 기준음 조절 |
| **설정** | Supabase 이메일 로그인, 로컬 → 클라우드 이전, JSON 백업 내려받기·불러오기 |

### 단축키 (플레이어)

`Space` 재생/정지 · `A` / `B` 구간 시작/끝 · `L` 반복 켜기/끄기 · `←` `→` 5초 이동 · `[` `]` 속도 ±5% · `0` 구간 처음으로

## 데이터는 어디에 저장되나요?

```
음원 파일 (mp3, wav …)        → 내 PC 폴더에서 바로 읽음. 어디에도 업로드하지 않음
곡 목록 · 구간 · 연습 기록     → Supabase (로그인 전에는 이 브라우저의 IndexedDB)
백업                          → 설정 화면에서 JSON으로 내려받기
```

- 음원 폴더 연결은 **Chrome / Edge**에서 됩니다(File System Access API). 다른 브라우저에서는 연습할 때마다 파일을 직접 고릅니다.
- 음원 폴더를 OneDrive·구글 드라이브 동기화 폴더로 고르면 음원도 자동으로 백업됩니다.

## 시작하기

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 단위 테스트
npm run build    # dist/ 생성
```

Supabase를 연결하지 않아도 바로 쓸 수 있습니다. 이때는 **로컬 모드**라서 브라우저 사이트 데이터를 지우면 기록이 사라질 수 있습니다.

## Supabase 연결 (영구 저장)

1. [supabase.com](https://supabase.com)에서 새 프로젝트를 만듭니다. 무료 플랜이면 충분합니다.
2. **SQL Editor**에 [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) 내용을 붙여 넣고 실행합니다.
3. **Authentication → URL Configuration**
   - Site URL: 배포 주소 (예: `https://del2f.github.io/woodshed/`)
   - Redirect URLs에 `http://localhost:5173/**` 와 배포 주소를 추가합니다.
4. **Project Settings → API**에서 `Project URL`과 `anon public` 키를 복사합니다.
5. 로컬 개발: `.env.example`을 `.env.local`로 복사하고 두 값을 채웁니다.
6. 처음 로그인해 계정이 만들어지면 **Authentication → Sign In / Providers**에서 *Allow new users to sign up*을 끕니다. 다른 사람이 계정을 만들 수 없게 막는 설정입니다. 데이터는 원래 RLS로 본인만 볼 수 있습니다.

> `anon` 키는 브라우저에 공개되는 용도의 키라서 저장소에 올라가도 괜찮습니다. 데이터는 로그인과 RLS가 보호합니다. 반대로 `service_role` 키는 절대 넣지 마세요.

## GitHub Pages 배포

1. GitHub에 저장소를 만들고 push 합니다.
2. **Settings → Pages → Source**를 *GitHub Actions*로 바꿉니다.
3. **Settings → Secrets and variables → Actions → Variables**에 다음 두 값을 등록합니다.
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
4. `main`에 push 하면 테스트, 빌드, 배포가 자동으로 실행됩니다.

### Supabase 휴면 방지

무료 플랜은 7일 동안 요청이 없으면 프로젝트가 일시정지됩니다. `.github/workflows/supabase-keepalive.yml`이 3일마다 한 번씩 요청을 보내 깨워 둡니다. 위 3번의 Variables가 있어야 동작합니다.

GitHub은 저장소에 60일 동안 커밋이 없으면 예약 워크플로를 꺼 버립니다. 가끔 Actions 탭에서 다시 켜졌는지 확인하세요.

## 로드맵

- **v0.1**: 앱 뼈대, 라이브러리, 구간 반복 플레이어, 메트로놈, 튜너, Supabase 저장 ← *지금*
- **v0.2**: 로컬 분석 엔진(Python: Demucs · Basic Pitch · 코드 인식), 박자·키·코드 흐름, 지판 코드톤 표시
- **v0.3**: 타브 에디터(자동 초안 + 수정), 릭 보관함, 간격 반복 복습, 비공개 저장소로 자동 백업
- **v0.4**: 이론 커리큘럼 9개 레슨, 퀴즈, 백킹 트랙

## 구조

```
src/
  pages/            라이브러리 · 플레이어 · 메트로놈 · 튜너 · 설정
  features/
    player/         스피드 트레이너 로직
    metronome/      Web Audio 스케줄러
    tuner/          음높이 검출(NSDF), 튜닝 프리셋
  lib/
    store/          DataStore 인터페이스 — LocalStore(IndexedDB) / SupabaseStore
    audioFolder.ts  음원 폴더 연결·파일 찾기
supabase/migrations/ DB 스키마 + RLS
```
