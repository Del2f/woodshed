"""(선택) 기타 트랙 분리 — install-separation 스크립트로 설치했을 때만 쓴다.

1순위 BS-RoFormer SW (6분리: 보컬·베이스·드럼·기타·피아노·기타 등. 2026년 로컬 실행 가능한 공개 모델 중
기타 분리 평가가 가장 높음 — MVSEP Multisong 기타 SDR 9.05). bs-roformer-infer(MIT)로 실행하고
모델 파일(약 700MB)은 처음 한 번 ~/.woodshed/models 에 받는다(sha256 확인). 모델 가중치 라이선스는 '알 수 없음'.
2순위 Demucs htdemucs_6s — BS-RoFormer를 쓸 수 없을 때 예비로.
"""

from __future__ import annotations

import functools
import importlib.util
import os
import shutil
import subprocess
import sys
import threading
from pathlib import Path
from typing import Callable

import numpy as np

ROFORMER = "bs_roformer_sw"
DEMUCS = "htdemucs_6s"
STEMS = ("guitar", "no_guitar")
MODELS_DIR = Path(os.environ.get("WOODSHED_MODELS", Path.home() / ".woodshed" / "models"))
ROFORMER_SR = 44100
_MARKER = "separator.txt"

Report = Callable[[str], None]


def current() -> str | None:
    """지금 쓸 분리 모델 이름 (없으면 None). WOODSHED_SEPARATOR=htdemucs_6s 로 예전 모델을 고를 수 있다"""
    forced = os.environ.get("WOODSHED_SEPARATOR")
    has_roformer = importlib.util.find_spec("bs_roformer") is not None and importlib.util.find_spec("torch") is not None
    has_demucs = importlib.util.find_spec("demucs") is not None
    if forced == DEMUCS and has_demucs:
        return DEMUCS
    if has_roformer:
        return ROFORMER
    return DEMUCS if has_demucs else None


def available() -> bool:
    return current() is not None


@functools.cache
def gpu_name() -> str | None:
    if importlib.util.find_spec("torch") is None:
        return None
    import torch  # noqa: PLC0415 — 무거워서 필요할 때만

    return torch.cuda.get_device_name(0) if torch.cuda.is_available() else None


def stems_ready(out_dir: Path) -> bool:
    """이 폴더의 분리 트랙이 지금 모델로 만든 것인지"""
    marker = out_dir / _MARKER
    if not all((out_dir / f"{s}.flac").exists() for s in STEMS) or not marker.exists():
        return False
    return marker.read_text(encoding="utf-8").strip() == current()


def separate_guitar(audio: Path, out_dir: Path, report: Report | None = None) -> dict[str, Path]:
    """audio → out_dir/guitar.flac, out_dir/no_guitar.flac (예전 모델로 만든 파일이면 새로 만든다)"""
    if stems_ready(out_dir):
        return {s: out_dir / f"{s}.flac" for s in STEMS}
    out_dir.mkdir(parents=True, exist_ok=True)
    name = current()
    if name == ROFORMER:
        _separate_roformer(audio, out_dir, report or (lambda _s: None))
    elif name == DEMUCS:
        _separate_demucs(audio, out_dir)
    else:
        raise RuntimeError("기타 분리 기능이 설치되지 않았어요 (engine/install-separation 실행)")
    (out_dir / _MARKER).write_text(name, encoding="utf-8")
    return {s: out_dir / f"{s}.flac" for s in STEMS}


# ── BS-RoFormer SW ──

_roformer_lock = threading.Lock()


def _separate_roformer(audio: Path, out_dir: Path, report: Report) -> None:
    import soundfile as sf  # noqa: PLC0415
    import torch  # noqa: PLC0415
    from bs_roformer.clean_api import BSRoformerSession  # noqa: PLC0415
    from bs_roformer.utils import demix_track  # noqa: PLC0415

    from .audio_io import read_audio  # noqa: PLC0415

    data, sr = read_audio(audio)  # (샘플, 채널)
    if data.shape[1] == 1:
        data = np.repeat(data, 2, axis=1)
    data = data[:, :2]
    if sr != ROFORMER_SR:
        import librosa  # noqa: PLC0415

        data = librosa.resample(data.T, orig_sr=sr, target_sr=ROFORMER_SR).T
        sr = ROFORMER_SR
    mix = np.ascontiguousarray(data, dtype=np.float32)

    if not _model_downloaded():
        report("분리 모델 받는 중 (처음 한 번, 약 700MB)")
    with _roformer_lock:
        session = BSRoformerSession(models_dir=str(MODELS_DIR), device="auto", progress=False)
        try:
            session.load()
            report("기타 트랙 분리 중 (BS-RoFormer)")
            # bs-roformer-infer는 폴더 단위 API만 공개 — 같은 패키지의 demix_track을 직접 써서 배열로 받는다
            res, _ = demix_track(session._config, session._model, torch.tensor(mix.T), session.device, None)  # noqa: SLF001
        finally:
            session.close()
    guitar = np.asarray(res["guitar"], dtype=np.float32).T
    rest = mix - guitar  # 나머지 = 원곡 − 기타 (합치면 원곡과 똑같다)
    for stem, arr in (("guitar", guitar), ("no_guitar", rest)):
        sf.write(str(out_dir / f"{stem}.flac"), np.clip(arr, -1, 1), sr, subtype="PCM_24")


def _model_downloaded() -> bool:
    return any(MODELS_DIR.rglob("BS-Rofo-SW-Fixed.ckpt")) if MODELS_DIR.exists() else False


# ── Demucs (예비) ──


def _separate_demucs(audio: Path, out_dir: Path) -> None:
    work = out_dir / "_work"
    work.mkdir(parents=True, exist_ok=True)
    cmd = [
        sys.executable, "-m", "demucs",
        "-n", DEMUCS,
        "--two-stems", "guitar",
        "--flac",  # mp3는 인코더 지연이 생겨 원곡과 박자가 어긋난다
        "-o", str(work),
        "--filename", "{stem}.{ext}",
        str(audio),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if proc.returncode != 0:
        raise RuntimeError(f"기타 분리 실패: {proc.stderr.strip().splitlines()[-1] if proc.stderr.strip() else proc.returncode}")
    produced = work / DEMUCS
    for s in STEMS:
        src = produced / f"{s}.flac"
        if not src.exists():
            raise RuntimeError(f"분리 결과 파일이 없어요: {src.name}")
        shutil.move(str(src), out_dir / f"{s}.flac")
    shutil.rmtree(work, ignore_errors=True)
