"""박자·키·코드 분석.

모두 librosa + numpy로 구현한 가벼운 방식이라 GPU 없이도 곡당 수십 초 안에 끝난다.
- 박자: onset 기반 비트 추적, 저음 에너지로 마디 첫 박 위치 추정 (4/4 가정)
- 키: 크롬마 합 × Krumhansl-Kessler 프로파일 상관
- 코드: 박 단위 크롬마 × 코드 템플릿(메이저·마이너·7·파워코드), Viterbi로 매끄럽게
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

import librosa
import numpy as np

from .theory import CHORD_QUALITIES, chord_label, diatonic_chords, key_name

SR = 22050
HOP = 512

ProgressFn = Callable[[str, float], None]

# Krumhansl-Kessler 조성 프로파일
_MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
_MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


@dataclass
class BeatInfo:
    bpm: float
    beats: np.ndarray  # 초
    downbeats: np.ndarray  # 초
    beats_per_bar: int
    beat_frames: np.ndarray
    low_at: np.ndarray  # 박마다 저음 세기


@dataclass
class KeyInfo:
    tonic: int
    mode: str  # "major" | "minor"
    name: str
    confidence: float


def load_audio(path: str) -> tuple[np.ndarray, int]:
    y, sr = librosa.load(path, sr=SR, mono=True)
    if y.size == 0:
        raise ValueError("음원에서 소리를 읽지 못했어요")
    return y, sr


def track_beats(y: np.ndarray, sr: int, beats_per_bar: int = 4) -> BeatInfo:
    onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP, aggregate=np.median)
    _, frames = librosa.beat.beat_track(onset_envelope=onset, sr=sr, hop_length=HOP, units="frames")
    frames = np.asarray(frames, dtype=int)
    times = librosa.frames_to_time(frames, sr=sr, hop_length=HOP)

    if len(times) < 2:
        return BeatInfo(bpm=0.0, beats=times, downbeats=times, beats_per_bar=beats_per_bar, beat_frames=frames, low_at=np.zeros(len(times)))

    # 비트 위치는 프레임(23ms) 단위로 끊겨 있어서, 간격의 중앙값보다 전체 비트에 맞춘 직선의 기울기가 정확하다
    slope = float(np.polyfit(np.arange(len(times)), times, 1)[0])
    bpm = 60.0 / slope

    # 킥·베이스(150Hz 이하) 세기 — 마디 첫 박 추정에 쓴다 (refine_downbeats)
    spec = np.abs(librosa.stft(y, n_fft=2048, hop_length=HOP))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
    low = spec[freqs < 150].sum(axis=0)
    low_at = low[np.clip(frames, 0, len(low) - 1)]
    phase = int(np.argmax([low_at[p::beats_per_bar].mean() if len(low_at[p::beats_per_bar]) else 0 for p in range(beats_per_bar)]))
    return BeatInfo(
        bpm=round(bpm, 1),
        beats=times,
        downbeats=times[phase::beats_per_bar],
        beats_per_bar=beats_per_bar,
        beat_frames=frames,
        low_at=low_at,
    )


def _zscore(x: np.ndarray) -> np.ndarray:
    s = x.std()
    return (x - x.mean()) / s if s > 1e-9 else np.zeros_like(x)


def beat_sync(chroma: np.ndarray, beat_frames: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """박 단위 크롬마. 반환: (12 × 구간 수, 구간 경계 프레임). 0번 구간은 첫 박 이전."""
    n_frames = chroma.shape[1]
    bounds = np.unique(np.clip(np.concatenate([[0], beat_frames, [n_frames]]), 0, n_frames)).astype(int)
    seg = np.stack(
        [np.median(chroma[:, a:b], axis=1) if b > a else chroma[:, min(a, n_frames - 1)] for a, b in zip(bounds[:-1], bounds[1:])],
        axis=1,
    )
    return seg, bounds


def refine_downbeats(beats: BeatInfo, chroma: np.ndarray) -> np.ndarray:
    """마디 첫 박 = 화음이 바뀌는 박 + 킥·베이스가 센 박.

    코드는 대부분 마디 첫 박에서 바뀌므로 화성 변화가 가장 믿을 만한 단서다.
    저음 세기만 보면 베이스가 매 박 같은 세기로 칠 때 틀린다.
    """
    n = len(beats.beats)
    bpb = beats.beats_per_bar
    if n < bpb * 2:
        return beats.downbeats
    seg, bounds = beat_sync(chroma, beats.beat_frames)
    starts = list(bounds[:-1])
    change = np.zeros(n)
    for k, f in enumerate(beats.beat_frames):
        if f not in starts:
            continue
        i = starts.index(f)
        if i == 0:
            continue
        a, b = seg[:, i - 1], seg[:, i]
        change[k] = 1 - float(a @ b / max(np.linalg.norm(a) * np.linalg.norm(b), 1e-9))
    score = _zscore(change) + 0.5 * _zscore(beats.low_at.astype(float))
    phase = int(np.argmax([score[p::bpb].mean() for p in range(bpb)]))
    return extend_backward(beats.beats[phase::bpb])


def extend_backward(times: np.ndarray, tolerance: float = 0.25) -> np.ndarray:
    """비트 추적은 곡 맨 앞 박을 자주 놓친다. 같은 간격으로 0초 근처까지 거꾸로 채운다.

    예) 마디 첫 박이 2.04, 4.04, … 로 잡혔으면 0.04 에도 마디가 시작된 것.
    """
    if len(times) < 2:
        return times
    step = float(np.median(np.diff(times)))
    head: list[float] = []
    t = float(times[0]) - step
    while t > -tolerance * step:
        head.append(max(0.0, t))
        t -= step
    return np.concatenate([np.array(head[::-1]), times]) if head else times


def harmonic_chroma(y: np.ndarray, sr: int) -> np.ndarray:
    """타악기 성분을 덜어 낸 크롬마 (12 × 프레임)"""
    harm = librosa.effects.harmonic(y, margin=3.0)
    return librosa.feature.chroma_cqt(y=harm, sr=sr, hop_length=HOP, bins_per_octave=36)


def estimate_key(chroma: np.ndarray) -> KeyInfo:
    profile = chroma.sum(axis=1)
    if profile.sum() <= 0:
        return KeyInfo(0, "major", key_name(0, "major"), 0.0)
    scores: list[tuple[float, int, str]] = []
    for tonic in range(12):
        for mode, prof in (("major", _MAJOR_PROFILE), ("minor", _MINOR_PROFILE)):
            r = float(np.corrcoef(profile, np.roll(prof, tonic))[0, 1])
            scores.append((r, tonic, mode))
    scores.sort(reverse=True)
    best, second = scores[0], scores[1]
    confidence = max(0.0, min(1.0, (best[0] - second[0]) * 5 + best[0] * 0.5))
    return KeyInfo(best[1], best[2], key_name(best[1], best[2]), round(confidence, 2))


def _templates() -> tuple[np.ndarray, list[tuple[int, str]]]:
    rows, labels = [], []
    for quality, intervals in CHORD_QUALITIES.items():
        for root in range(12):
            v = np.zeros(12)
            for i, iv in enumerate(intervals):
                v[(root + iv) % 12] = 1.0 if i == 0 else 0.85  # 근음을 조금 더 무겁게
            rows.append(v / np.linalg.norm(v))
            labels.append((root, quality))
    return np.array(rows), labels


def _viterbi(log_emit: np.ndarray, stay: float) -> np.ndarray:
    """log_emit: (상태 K, 시점 T). 같은 코드에 머물 확률 stay, 나머지는 균등."""
    k, t = log_emit.shape
    log_stay = np.log(stay)
    log_move = np.log((1 - stay) / (k - 1))
    delta = log_emit[:, 0].copy()
    back = np.zeros((k, t), dtype=int)
    for i in range(1, t):
        best_prev = int(np.argmax(delta))
        move_score = delta[best_prev] + log_move
        stay_score = delta + log_stay
        use_stay = stay_score >= move_score
        back[:, i] = np.where(use_stay, np.arange(k), best_prev)
        delta = np.where(use_stay, stay_score, move_score) + log_emit[:, i]
    path = np.zeros(t, dtype=int)
    path[-1] = int(np.argmax(delta))
    for i in range(t - 1, 0, -1):
        path[i - 1] = back[path[i], i]
    return path


def estimate_chords(
    chroma: np.ndarray,
    beat_frames: np.ndarray,
    duration: float,
    key: KeyInfo | None = None,
    sr: int = SR,
    stay: float = 0.8,
) -> list[dict]:
    """박 단위로 코드를 정하고 같은 코드끼리 묶어 [{start, end, label}] 로 돌려준다. 'N' = 코드 없음."""
    if chroma.shape[1] == 0:
        return []
    seg, bounds = beat_sync(chroma, beat_frames)
    energy = seg.sum(axis=0)
    norm = seg / np.maximum(np.linalg.norm(seg, axis=0, keepdims=True), 1e-9)

    tmpl, labels = _templates()
    scores = tmpl @ norm  # (K, T), 코사인 유사도

    # 파워코드는 '3도가 정말 없을 때'만. 기타 오픈 코드(Em = E B E G B E)처럼
    # 근음·5도가 겹겹이 쌓여 3도가 상대적으로 약해도 3도가 들리면 메이저/마이너로 본다.
    for k, (root, quality) in enumerate(labels):
        if quality == "5":
            third = np.maximum(norm[(root + 3) % 12], norm[(root + 4) % 12])
            scores[k] -= 0.9 * third
    if key is not None:
        diatonic = diatonic_chords(key.tonic, key.mode)
        bonus = np.array([0.04 if lab in diatonic else 0.0 for lab in labels])
        scores = scores + bonus[:, None]

    # 'N'(코드 없음) 상태: 소리가 거의 없을 때만 이긴다
    quiet = energy < 0.15 * np.median(energy[energy > 0]) if np.any(energy > 0) else np.ones_like(energy, dtype=bool)
    n_score = np.where(quiet, 1.2, 0.3)
    scores = np.vstack([scores, n_score])
    labels = labels + [(-1, "N")]

    path = _viterbi(scores * 12.0, stay)  # 12배: 코사인 차이를 로그 확률 차이로 키움

    times = librosa.frames_to_time(bounds, sr=sr, hop_length=HOP)
    times[-1] = duration
    out: list[dict] = []
    for i, state in enumerate(path):
        root, quality = labels[state]
        label = "N" if root < 0 else chord_label(root, quality)
        start, end = float(times[i]), float(times[i + 1])
        if out and out[-1]["label"] == label:
            out[-1]["end"] = round(end, 3)
        else:
            out.append({"start": round(start, 3), "end": round(end, 3), "label": label})
    return out


def analyze(path: str, progress: ProgressFn | None = None) -> dict:
    report = progress or (lambda _step, _p: None)
    report("음원 읽는 중", 0.05)
    y, sr = load_audio(path)
    duration = float(len(y) / sr)

    report("박자 찾는 중", 0.2)
    beats = track_beats(y, sr)

    report("화성 분석 중", 0.45)
    chroma = harmonic_chroma(y, sr)
    key = estimate_key(chroma)
    beats.downbeats = refine_downbeats(beats, chroma)

    report("코드 진행 찾는 중", 0.7)
    chords = estimate_chords(chroma, beats.beat_frames, duration, key, sr)

    return {
        "duration": round(duration, 3),
        "bpm": beats.bpm,
        "beatsPerBar": beats.beats_per_bar,
        "beats": [round(float(t), 3) for t in extend_backward(beats.beats)],
        "downbeats": [round(float(t), 3) for t in beats.downbeats],
        "key": {"name": key.name, "tonic": key.tonic, "mode": key.mode, "confidence": key.confidence},
        "chords": chords,
    }
