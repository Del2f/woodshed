"""음원 읽기 — libsndfile이 못 읽는 MP3·M4A도 PyAV(FFmpeg)로 읽는다."""

from __future__ import annotations

import av
import numpy as np
import pytest
import soundfile as sf

from woodshed_engine import audio_io
from woodshed_engine.analysis import SR, load_audio


def tone(seconds: float = 3.0, sr: int = 44100) -> np.ndarray:
    t = np.arange(int(seconds * sr)) / sr
    left = 0.3 * np.sin(2 * np.pi * 110 * t)
    right = 0.3 * np.sin(2 * np.pi * 165 * t)
    return np.stack([left, right]).astype(np.float32)  # (채널, 샘플)


def encode(path, data: np.ndarray, sr: int, codec: str, fmt: str) -> None:
    """PyAV로 압축 음원 파일을 만든다 (1024 샘플씩 — AAC·MP3 프레임 크기)"""
    with av.open(str(path), "w", format=fmt) as out:
        st = out.add_stream(codec, rate=sr, layout="stereo")
        step = 1152 if codec == "libmp3lame" else 1024
        for i in range(0, data.shape[1], step):
            frame = av.AudioFrame.from_ndarray(np.ascontiguousarray(data[:, i : i + step]), format="fltp", layout="stereo")
            frame.sample_rate = sr
            frame.pts = i
            for p in st.encode(frame):
                out.mux(p)
        for p in st.encode(None):
            out.mux(p)


@pytest.mark.parametrize(("name", "codec", "fmt"), [("song.m4a", "aac", "mp4"), ("song.mp3", "libmp3lame", "mp3")])
def test_reads_compressed_formats(tmp_path, name, codec, fmt):
    path = tmp_path / name
    encode(path, tone(), 44100, codec, fmt)
    data, sr = audio_io.read_audio(path)
    assert sr == 44100
    assert data.shape[1] == 2
    assert abs(len(data) / sr - 3.0) < 0.1
    y, s = load_audio(str(path))
    assert s == SR and abs(len(y) / SR - 3.0) < 0.1


def test_falls_back_when_libsndfile_fails_mid_read(tmp_path, monkeypatch):
    """실제로 받은 오류: libsndfile이 MP3를 읽다가 'Unspecified internal error'"""
    path = tmp_path / "song.mp3"
    encode(path, tone(), 44100, "libmp3lame", "mp3")

    def broken(*_a, **_k):
        raise sf.LibsndfileError(1, prefix="Error : ")

    monkeypatch.setattr(audio_io.sf, "read", broken)
    data, sr = audio_io.read_audio(path)
    assert sr == 44100 and data.shape[1] == 2 and len(data) > 44100 * 2.5


def test_decode_to_wav_keeps_stereo_and_length(tmp_path):
    src = tmp_path / "song.m4a"
    encode(src, tone(4.0), 44100, "aac", "mp4")
    dst = audio_io.decode_to_wav(src, tmp_path / "decoded.wav")
    info = sf.info(str(dst))
    assert info.channels == 2 and info.samplerate == 44100
    assert abs(info.duration - 4.0) < 0.1


def test_unreadable_file_gives_friendly_error(tmp_path):
    bad = tmp_path / "broken.mp3"
    bad.write_bytes(b"this is not audio" * 100)
    with pytest.raises(audio_io.AudioDecodeError, match="읽지 못했어요"):
        audio_io.read_audio(bad)
