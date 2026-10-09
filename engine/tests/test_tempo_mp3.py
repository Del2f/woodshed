"""MP3로 압축하면 비트 추적이 2/3 템포(120 → 80)를 고르던 문제의 회귀 테스트.

실제로 엔진에서 틀렸던 음원과 같은 방식(44.1kHz 스테레오, 1·3박 킥 / 2·4박 스네어,
8분음표 디스토션 리프)으로 만들어 MP3로 저장한 뒤 엔진 로더로 읽는다.
"""

from __future__ import annotations

import av
import numpy as np
import soundfile as sf

from woodshed_engine.analysis import load_audio, track_beats


def make_mix(bpm: float = 120, sr: int = 44100) -> np.ndarray:
    beat, bars = 60 / bpm, 8
    n = int(bars * 4 * beat * sr)
    t = np.arange(n) / sr
    g, b_, d = np.zeros(n), np.zeros(n), np.zeros(n)
    hz = lambda m: 440 * 2 ** ((m - 69) / 12)  # noqa: E731
    for k in range(bars * 4):
        root = [40, 48, 50, 47][(k // 4) % 4]
        s, e = int(k * beat * sr), int(k * beat * sr) + int(beat * sr)
        tt = t[s:e] - t[s]
        for half in (0, 1):
            hs = int(half * beat / 2 * sr)
            seg = tt[hs:] - tt[hs]
            w = sum(2 * ((seg * hz(m)) % 1) - 1 for m in (root, root + 7, root + 12))
            g[s + hs : e] += np.tanh(4 * w * np.exp(-seg * 6)) * 0.3
        b_[s:e] += np.sin(2 * np.pi * hz(root - 12) * tt) * np.exp(-tt * 3) * 0.5
        if k % 2 == 0:
            d[s:e] += np.sin(2 * np.pi * (50 + 80 * np.exp(-tt * 40)) * tt) * np.exp(-tt * 12) * 0.8
        else:
            d[s:e] += np.random.default_rng(k).normal(0, 1, len(tt)) * np.exp(-tt * 18) * 0.35
        d[s:e] += np.random.default_rng(1000 + k).normal(0, 1, len(tt)) * np.exp(-tt * 60) * 0.08
    mix = g + b_ + d
    mix /= np.max(np.abs(mix)) * 1.1
    return np.stack([mix, mix], axis=1).astype(np.float32)


def write_mp3(path, data: np.ndarray, sr: int = 44100) -> None:
    d = np.ascontiguousarray(data.T)
    with av.open(str(path), "w", format="mp3") as out:
        st = out.add_stream("libmp3lame", rate=sr, layout="stereo")
        for i in range(0, d.shape[1], 1152):
            fr = av.AudioFrame.from_ndarray(np.ascontiguousarray(d[:, i : i + 1152]), format="fltp", layout="stereo")
            fr.sample_rate, fr.pts = sr, i
            for p in st.encode(fr):
                out.mux(p)
        for p in st.encode(None):
            out.mux(p)


def test_same_tempo_for_wav_and_mp3(tmp_path):
    data = make_mix()
    sf.write(tmp_path / "mix.wav", data, 44100)
    write_mp3(tmp_path / "mix.mp3", data)
    for name in ("mix.wav", "mix.mp3"):
        y, sr = load_audio(str(tmp_path / name))
        assert abs(track_beats(y, sr).bpm - 120) < 2, name
