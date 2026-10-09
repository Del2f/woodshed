"""음원 읽기.

libsndfile(soundfile)은 WAV·FLAC에 강하지만 일부 MP3는 읽다가 'Unspecified internal error'로
멈추고, M4A/AAC는 아예 못 연다. 실패하면 FFmpeg가 들어 있는 PyAV로 다시 읽는다.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import soundfile as sf


class AudioDecodeError(ValueError):
    pass


def _read_with_av(path: Path) -> tuple[np.ndarray, int]:
    import av  # noqa: PLC0415 — FFmpeg 라이브러리라 필요할 때만

    with av.open(str(path)) as container:
        stream = next((s for s in container.streams if s.type == "audio"), None)
        if stream is None:
            raise AudioDecodeError("오디오 트랙이 없어요")
        sr = stream.rate or stream.codec_context.sample_rate
        channels = 2 if (stream.channels or 1) >= 2 else 1
        resampler = av.AudioResampler(format="fltp", layout="stereo" if channels == 2 else "mono", rate=sr)
        chunks: list[np.ndarray] = []
        for frame in container.decode(stream):
            for f in resampler.resample(frame):
                chunks.append(f.to_ndarray())
        for f in resampler.resample(None):
            chunks.append(f.to_ndarray())
    if not chunks:
        raise AudioDecodeError("소리가 담긴 부분이 없어요")
    return np.concatenate(chunks, axis=1).T.astype(np.float32), int(sr)  # (샘플, 채널)


def read_audio(path: str | Path) -> tuple[np.ndarray, int]:
    """(샘플 × 채널) float32, 샘플레이트"""
    path = Path(path)
    try:
        data, sr = sf.read(str(path), dtype="float32", always_2d=True)
        if len(data):
            return data, int(sr)
    except Exception:  # noqa: BLE001 — libsndfile 실패는 종류가 많다. 어떤 실패든 PyAV로 다시
        pass
    try:
        return _read_with_av(path)
    except AudioDecodeError:
        raise
    except Exception as e:  # noqa: BLE001
        raise AudioDecodeError(f"음원 파일을 읽지 못했어요 ({path.suffix or '형식 모름'}): {e}") from e


def decode_to_wav(src: str | Path, dst: str | Path) -> Path:
    """어떤 형식이든 WAV로 풀어 둔다 — 기타 분리와 분석이 같은 파일을 안전하게 읽도록"""
    data, sr = read_audio(src)
    dst = Path(dst)
    dst.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(dst), data, sr, subtype="FLOAT")
    return dst
