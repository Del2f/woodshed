"""(선택) Demucs로 기타 트랙 분리 — install-separation 스크립트로 설치했을 때만 쓴다."""

from __future__ import annotations

import functools
import importlib.util
import shutil
import subprocess
import sys
from pathlib import Path

MODEL = "htdemucs_6s"  # 기타 스템이 따로 있는 6-스템 모델
STEMS = ("guitar", "no_guitar")


def available() -> bool:
    return importlib.util.find_spec("demucs") is not None


@functools.cache
def gpu_name() -> str | None:
    if importlib.util.find_spec("torch") is None:
        return None
    import torch  # noqa: PLC0415 — 무거워서 필요할 때만

    return torch.cuda.get_device_name(0) if torch.cuda.is_available() else None


def separate_guitar(audio: Path, out_dir: Path) -> dict[str, Path]:
    """audio → out_dir/guitar.flac, out_dir/no_guitar.flac"""
    if all((out_dir / f"{s}.flac").exists() for s in STEMS):
        return {s: out_dir / f"{s}.flac" for s in STEMS}

    work = out_dir / "_work"
    work.mkdir(parents=True, exist_ok=True)
    cmd = [
        sys.executable, "-m", "demucs",
        "-n", MODEL,
        "--two-stems", "guitar",
        "--flac",  # mp3는 인코더 지연이 생겨 원곡과 박자가 어긋난다
        "-o", str(work),
        "--filename", "{stem}.{ext}",
        str(audio),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if proc.returncode != 0:
        raise RuntimeError(f"기타 분리 실패: {proc.stderr.strip().splitlines()[-1] if proc.stderr.strip() else proc.returncode}")

    produced = work / MODEL
    out: dict[str, Path] = {}
    for s in STEMS:
        src = produced / f"{s}.flac"
        if not src.exists():
            raise RuntimeError(f"분리 결과 파일이 없어요: {src.name}")
        dst = out_dir / f"{s}.flac"
        shutil.move(str(src), dst)
        out[s] = dst
    shutil.rmtree(work, ignore_errors=True)
    return out
