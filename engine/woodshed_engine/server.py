"""로컬 분석 서버 (http://127.0.0.1:8765).

브라우저의 Woodshed가 음원을 이 서버로 보내면 분석해서 JSON으로 돌려준다.
127.0.0.1에만 열리므로 같은 PC 밖에서는 접속할 수 없다.
"""

from __future__ import annotations

import hashlib
import json
import os
import threading
import time
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from . import ANALYSIS_VERSION, __version__, separation
from .analysis import analyze

CACHE_DIR = Path(os.environ.get("WOODSHED_CACHE", Path.home() / ".woodshed" / "cache"))
MAX_UPLOAD = 400 * 1024 * 1024  # 400MB

DEFAULT_ORIGINS = ["https://del2f.github.io", "http://localhost:5173", "http://127.0.0.1:5173"]
ORIGINS = [o.strip() for o in os.environ.get("WOODSHED_ORIGINS", ",".join(DEFAULT_ORIGINS)).split(",") if o.strip()]

app = FastAPI(title="Woodshed Engine", version=__version__)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.middleware("http")
async def private_network_access(request: Request, call_next):
    # 공개 사이트(https) → localhost 요청을 Chrome이 허용하도록 (Private/Local Network Access)
    response = await call_next(request)
    if request.headers.get("access-control-request-private-network") == "true":
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response


@dataclass
class Job:
    id: str
    file_hash: str
    separate: bool
    status: str = "queued"  # queued | running | done | error
    step: str = "대기 중"
    progress: float = 0.0
    result: dict[str, Any] | None = None
    error: str | None = None
    created: float = field(default_factory=time.time)

    def public(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "status": self.status,
            "step": self.step,
            "progress": round(self.progress, 3),
            "result": self.result,
            "error": self.error,
        }


jobs: dict[str, Job] = {}
jobs_lock = threading.Lock()
# GPU·CPU를 한 곡씩만 쓰도록 한 줄로 처리
executor = ThreadPoolExecutor(max_workers=1)


def _paths(file_hash: str) -> tuple[Path, Path]:
    return CACHE_DIR / "results" / f"{file_hash}.json", CACHE_DIR / "stems" / file_hash


def _cached(file_hash: str, separate: bool) -> dict[str, Any] | None:
    result_path, stem_dir = _paths(file_hash)
    if not result_path.exists():
        return None
    try:
        data = json.loads(result_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if data.get("version") != ANALYSIS_VERSION:
        return None
    if separate and not data.get("stems"):
        return None
    return data


def _run(job: Job, audio: Path) -> None:
    def report(step: str, p: float) -> None:
        job.step, job.progress = step, p

    job.status = "running"
    try:
        result = analyze(str(audio), report)
        result_path, stem_dir = _paths(job.file_hash)
        stems: list[str] = []
        if job.separate:
            report("기타 트랙 분리 중 (GPU가 있으면 빨라요)", 0.8)
            separation.separate_guitar(audio, stem_dir)
            stems = list(separation.STEMS)
        data = {
            "version": ANALYSIS_VERSION,
            "engineVersion": __version__,
            "analyzedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "fileHash": job.file_hash,
            **result,
            "stems": stems,
        }
        result_path.parent.mkdir(parents=True, exist_ok=True)
        result_path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        job.result = data
        job.status, job.step, job.progress = "done", "완료", 1.0
    except Exception as e:  # noqa: BLE001 — 어떤 실패든 브라우저에 알려야 한다
        traceback.print_exc()
        job.status, job.error = "error", str(e) or e.__class__.__name__
    finally:
        # 분석이 끝나면 업로드 사본은 지운다 (분리 트랙과 결과 JSON만 남김)
        try:
            audio.unlink(missing_ok=True)
        except OSError:
            pass


@app.get("/health")
def health() -> dict[str, Any]:
    sep = separation.available()
    return {
        "ok": True,
        "version": __version__,
        "analysisVersion": ANALYSIS_VERSION,
        "features": {"separation": sep, "gpu": separation.gpu_name() if sep else None},
    }


@app.post("/analyze")
async def start_analysis(file: UploadFile = File(...), separate: bool = Form(False)) -> dict[str, Any]:
    data = await file.read()
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "파일이 너무 커요 (최대 400MB)")
    if not data:
        raise HTTPException(400, "빈 파일이에요")
    if separate and not separation.available():
        raise HTTPException(400, "기타 분리 기능이 설치되지 않았어요 (engine/install-separation 실행)")

    file_hash = hashlib.sha1(data).hexdigest()
    job = Job(id=uuid.uuid4().hex, file_hash=file_hash, separate=separate)

    cached = _cached(file_hash, separate)
    if cached is not None:
        job.status, job.step, job.progress, job.result = "done", "완료 (이전 분석 결과)", 1.0, cached
    else:
        ext = Path(file.filename or "audio").suffix.lower() or ".audio"
        upload = CACHE_DIR / "uploads" / f"{job.id}{ext}"
        upload.parent.mkdir(parents=True, exist_ok=True)
        upload.write_bytes(data)
        executor.submit(_run, job, upload)

    with jobs_lock:
        jobs[job.id] = job
        # 오래된 작업 정리
        for jid in [j.id for j in jobs.values() if time.time() - j.created > 6 * 3600]:
            jobs.pop(jid, None)
    return job.public()


@app.get("/jobs/{job_id}")
def job_status(job_id: str) -> dict[str, Any]:
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(404, "작업을 찾을 수 없어요 (엔진을 다시 켰다면 다시 분석해 주세요)")
    return job.public()


@app.get("/stems/{file_hash}/{name}")
def stem(file_hash: str, name: str) -> FileResponse:
    if name not in separation.STEMS or not all(c in "0123456789abcdef" for c in file_hash) or len(file_hash) != 40:
        raise HTTPException(404)
    path = _paths(file_hash)[1] / f"{name}.flac"
    if not path.exists():
        raise HTTPException(404, "분리된 트랙이 없어요")
    return FileResponse(path, media_type="audio/flac")


def main() -> None:
    import uvicorn  # noqa: PLC0415

    port = int(os.environ.get("WOODSHED_PORT", "8765"))
    print(f"\n  Woodshed 분석 엔진 {__version__}  →  http://127.0.0.1:{port}")
    print(f"  기타 분리: {'사용 가능' if separation.available() else '미설치 (install-separation 실행 시 사용 가능)'}")
    print(f"  캐시 폴더: {CACHE_DIR}\n  이 창을 닫으면 엔진이 꺼집니다.\n")
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    main()
