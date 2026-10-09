@echo off
chcp 65001 >nul
title Woodshed 분석 엔진
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo [Woodshed] 처음 실행이라 파이썬 환경을 만들어요. 몇 분 걸릴 수 있어요...
  py -3.12 -m venv .venv 2>nul || python -m venv .venv
  if not exist ".venv\Scripts\python.exe" (
    echo [Woodshed] Python 3.10 이상이 필요해요: https://www.python.org/downloads/
    pause
    exit /b 1
  )
  ".venv\Scripts\python.exe" -m pip install --upgrade pip
)

rem 업데이트로 필요한 패키지가 늘었을 수 있어 매번 확인한다 (이미 있으면 몇 초면 끝남)
echo [Woodshed] 필요한 패키지 확인 중...
".venv\Scripts\python.exe" -m pip install -q --disable-pip-version-check -r requirements.txt || (pause & exit /b 1)

".venv\Scripts\python.exe" -m woodshed_engine
pause
