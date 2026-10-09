@echo off
chcp 65001 >nul
title Woodshed 기타 분리 설치
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo [Woodshed] 먼저 start.bat 을 한 번 실행해 주세요.
  pause
  exit /b 1
)

echo [Woodshed] PyTorch(NVIDIA GPU용, 약 3GB)와 Demucs를 설치합니다.
echo            NVIDIA 그래픽카드가 없으면 CPU로도 동작하지만 곡당 몇 분 걸려요.
".venv\Scripts\python.exe" -m pip install torch==2.8.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cu128 || (pause & exit /b 1)
".venv\Scripts\python.exe" -m pip install -r requirements-separation.txt || (pause & exit /b 1)

echo.
echo [Woodshed] 설치 완료. start.bat 으로 엔진을 다시 켜 주세요.
pause
