"""박자·키·코드 분석.

모두 librosa + numpy로 구현한 가벼운 방식이라 GPU 없이도 곡당 수십 초 안에 끝난다.
- 박자: onset 기반 비트 추적 → 절반·두 배 템포 보정 → 화성·저음 변화로 마디 첫 박 (4/4 가정)
- 베이스: 저음 대역에서 '가장 낮게 울리는 음' — 디스토션 배음은 기본음 위에만 생기므로
  근음의 가장 믿을 만한 단서다. (기타 분리를 했다면 기타 뺀 트랙에서 찾는다)
- 키: 크롬마 · 베이스 분포 · 코드 근음 분포 × Krumhansl-Kessler 프로파일
- 코드: 박 단위 크롬마 × 배음까지 넣은 코드 템플릿 + 베이스 근음, Viterbi로 매끄럽게
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
    # 템포 보정: 중앙값 방식은 킥(저음 대역에만 있음)을 거의 못 본다. 전체 대역과 저음 대역(킥·베이스)
    # 타격 세기를 따로 만들어, 어느 쪽이든 박 사이에 센 타격이 있으면 두 배로 본다.
    onset_full = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP, aggregate=np.mean)
    onset_low = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP, aggregate=np.mean, fmax=200, n_mels=16)
    frames = fix_tempo_octave([onset_full, onset_low], np.asarray(frames, dtype=int), sr)
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


def fix_tempo_octave(onsets: list[np.ndarray], frames: np.ndarray, sr: int, slow: float = 110.0, fast: float = 200.0) -> np.ndarray:
    """절반·두 배 템포 보정.

    킥·스네어가 번갈아 나오면 비트 추적이 한쪽만 따라가 절반 템포(120 → 60)를 고르기 쉽다.
    박과 박 사이에도 박의 절반 이상 센 타격이 (어느 대역에서든) 있으면 그 자리를 박으로 넣는다.
    반대로 200 BPM을 넘으면 한 박 건너 하나만 남긴다.
    """
    if len(frames) < 4:
        return frames
    bpm = 60.0 / (float(np.median(np.diff(frames))) * HOP / sr)

    def strength(onset: np.ndarray, fr: np.ndarray) -> float:
        # 프레임 경계에 걸쳐도 놓치지 않게 ±1프레임 중 최대
        idx = np.clip(fr[:, None] + np.array([-1, 0, 1])[None, :], 0, len(onset) - 1)
        return float(np.mean(onset[idx].max(axis=1)))

    def alternates(onset: np.ndarray) -> bool:
        # 잡은 박이 '센 박·여린 박'으로 번갈아 나오면(킥·스네어 교대) 이미 4분음표 박을 맞게 잡은 것
        even, odd = strength(onset, frames[0::2]), strength(onset, frames[1::2])
        return abs(even - odd) > 0.4 * max(even, odd, 1e-9)

    if bpm < slow:
        mids = (frames[:-1] + frames[1:]) // 2
        strong_mids = any(strength(o, mids) > 0.5 * strength(o, frames) for o in onsets)
        if strong_mids and not any(alternates(o) for o in onsets):
            return np.sort(np.concatenate([frames, mids]))
    elif bpm > fast or backbeat_every_four(onsets[0], frames):
        even, odd = frames[0::2], frames[1::2]
        return even if strength(onsets[0], even) >= strength(onsets[0], odd) else odd
    return frames


def backbeat_every_four(onset: np.ndarray, frames: np.ndarray) -> bool:
    """잡은 박에서 센 타격(스네어)이 4박마다 반복되면, 8분음표를 박으로 잡은 것이다.

    록·메탈은 거의 항상 2·4박에 스네어가 온다(백비트). 박을 제대로 잡았다면 센 타격은 2박 주기,
    두 배 빠르게 잡았다면 4박 주기로 나타난다.
    """
    if len(frames) < 16:
        return False
    idx = np.clip(frames[:, None] + np.array([-1, 0, 1])[None, :], 0, len(onset) - 1)
    s = onset[idx].max(axis=1)
    z = s - s.mean()
    energy = float(z @ z)
    if energy <= 1e-9:
        return False
    acf = lambda lag: float(z[:-lag] @ z[lag:]) / energy  # noqa: E731
    return acf(2) < 0 and acf(4) > 0.3


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


def refine_downbeats(beats: BeatInfo, chroma: np.ndarray, bass: np.ndarray | None = None) -> np.ndarray:
    """마디 첫 박 = 화음·베이스 음이 바뀌는 박 + 킥·베이스가 센 박.

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
    bass_change = np.zeros(n)
    for k, f in enumerate(beats.beat_frames):
        if f not in starts:
            continue
        i = starts.index(f)
        if i == 0:
            continue
        a, b = seg[:, i - 1], seg[:, i]
        change[k] = 1 - float(a @ b / max(np.linalg.norm(a) * np.linalg.norm(b), 1e-9))
        if bass is not None and i < bass.shape[1]:
            bass_change[k] = 0.5 * float(np.abs(bass[:, i] - bass[:, i - 1]).sum())
    score = _zscore(change) + _zscore(bass_change) + 0.5 * _zscore(beats.low_at.astype(float))
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


def estimate_tuning(y: np.ndarray, sr: int) -> float:
    """곡 전체의 튜닝 오차(반음 단위, -0.5~0.5). 크롬마와 베이스가 같은 기준을 쓰게 한다."""
    t = float(librosa.estimate_tuning(y=y, sr=sr, bins_per_octave=36))
    return t if np.isfinite(t) else 0.0


def harmonic_chroma(y: np.ndarray, sr: int, tuning: float | None = None) -> np.ndarray:
    """타악기 성분을 덜어 낸 크롬마 (12 × 프레임)"""
    harm = librosa.effects.harmonic(y, margin=3.0)
    return librosa.feature.chroma_cqt(y=harm, sr=sr, hop_length=HOP, bins_per_octave=36, tuning=tuning)


BASS_FMIN = 32.70  # C1 — 베이스 E1(41Hz), 7현 B1, Drop C까지
BASS_BINS = 30  # C1 ~ F3 (185Hz): 기타 저음 줄의 기본음까지, 코드의 3도는 대부분 이 위


def bass_notes(y: np.ndarray, sr: int, tuning: float = 0.0) -> tuple[np.ndarray, np.ndarray]:
    """프레임마다 '가장 낮게 세게 울리는 음'의 음이름(0=C)과 세기.

    디스토션은 기본음 위로만 배음을 만들고, 파워코드의 혼변조음(5도 − 근음)은 근음의 한 옥타브
    아래에 생긴다. 그래서 가장 낮은 음은 디스토션이 아무리 세도 근음을 가리킨다.

    저음역은 칸끼리 에너지가 번지고, 감쇠하는 음은 양옆에 작은 봉우리를 만든다. 그냥 '처음으로
    센 칸'을 고르면 반음 아래가 걸린다. 반음을 3칸으로 나눠 본 뒤 반음마다 합쳐서, 그 '봉우리
    (양옆 반음보다 센 음)' 중 가장 낮은 것을 고른다.
    """
    harm = librosa.effects.harmonic(y, margin=2.0)  # 킥 같은 타악기 저음을 덜어 냄
    c = np.abs(
        librosa.cqt(harm, sr=sr, hop_length=HOP, fmin=BASS_FMIN, n_bins=BASS_BINS * 3, bins_per_octave=36, tuning=tuning)
    )
    centers = np.arange(BASS_BINS) * 3
    semis = c[centers] + c[np.clip(centers - 1, 0, None)] * (centers > 0)[:, None] + c[np.clip(centers + 1, None, len(c) - 1)]
    peak = semis.max(axis=0)
    padded = np.pad(semis, ((1, 1), (0, 0)))
    is_peak = (semis >= padded[:-2]) & (semis >= padded[2:]) & (semis >= 0.5 * peak[None, :])
    lowest = np.argmax(is_peak, axis=0)
    return lowest % 12, peak


def bass_by_segment(pcs: np.ndarray, weight: np.ndarray, bounds: np.ndarray) -> np.ndarray:
    """박 구간마다 베이스 음 분포 (12 × 구간 수, 각 열의 합 = 1)"""
    n = len(pcs)
    out = np.zeros((12, len(bounds) - 1))
    for i, (a, b) in enumerate(zip(bounds[:-1], bounds[1:])):
        a, b = min(a, n), min(max(b, a + 1), n)
        if b > a:
            np.add.at(out[:, i], pcs[a:b], weight[a:b])
    s = out.sum(axis=0, keepdims=True)
    return np.divide(out, s, out=np.zeros_like(out), where=s > 0)


def _key_correlations(profile: np.ndarray) -> np.ndarray:
    """24개 키(장조 0~11, 단조 12~23)와의 상관"""
    if profile.sum() <= 0 or profile.std() < 1e-9:
        return np.zeros(24)
    return np.array(
        [float(np.corrcoef(profile, np.roll(p, t))[0, 1]) for p in (_MAJOR_PROFILE, _MINOR_PROFILE) for t in range(12)]
    )


def estimate_key(chroma: np.ndarray, bass_profile: np.ndarray | None = None, root_profile: np.ndarray | None = None) -> KeyInfo:
    """크롬마만 쓰면 디스토션 배음에 휘둘린다. 베이스 음 분포와 코드 근음 분포를 함께 본다."""
    parts = [(_key_correlations(chroma.sum(axis=1)), 1.0)]
    if bass_profile is not None and bass_profile.sum() > 0:
        parts.append((_key_correlations(bass_profile), 1.2))
    if root_profile is not None and root_profile.sum() > 0:
        parts.append((_key_correlations(root_profile), 1.2))
    total = sum(w for _, w in parts)
    score = sum(c * w for c, w in parts) / total
    best = int(np.argmax(score))

    # 나란한조(같은 음을 쓰는 장·단조)나 점수가 비슷한 키끼리는 '어느 음이 중심(으뜸음)인가'로 가른다:
    # 베이스가 오래 머문 음, 첫·마지막 코드의 근음.
    tonic_evidence = np.zeros(12)
    for prof in (bass_profile, root_profile):
        if prof is not None and prof.sum() > 0:
            tonic_evidence += prof / prof.sum()
    if tonic_evidence.sum() > 0:
        relative = (best % 12 + 9) % 12 + 12 if best < 12 else (best % 12 + 3) % 12
        candidates = {best, relative} | {int(k) for k in np.flatnonzero(score >= score[best] - 0.08)}
        best = max(candidates, key=lambda k: score[k] + 0.25 * tonic_evidence[k % 12])

    second = max((k for k in range(24) if k != best), key=lambda k: score[k])
    tonic, mode = best % 12, ("major" if best < 12 else "minor")
    confidence = max(0.0, min(1.0, (score[best] - score[second]) * 5 + score[best] * 0.5))
    return KeyInfo(tonic, mode, key_name(tonic, mode), round(confidence, 2))


# 음 하나가 실제로 내는 소리: 기본음 + 배음 (옥타브·5도·옥타브·장3도·5도). 크롬마에 미리 반영해 두면
# 디스토션 파워코드의 5배음(장3도 자리)을 3도로 착각하지 않는다.
_HARMONICS = [(0, 1.0), (0, 0.6), (7, 0.45), (0, 0.3), (4, 0.22), (7, 0.18)]


def _templates(harmonic: bool = True) -> tuple[np.ndarray, list[tuple[int, str]]]:
    rows, labels = [], []
    for quality, intervals in CHORD_QUALITIES.items():
        for root in range(12):
            v = np.zeros(12)
            for i, iv in enumerate(intervals):
                w = 1.0 if i == 0 else 0.85  # 근음을 조금 더 무겁게
                for offset, hw in _HARMONICS if harmonic else [(0, 1.0)]:
                    v[(root + iv + offset) % 12] += w * hw
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
    bass: np.ndarray | None = None,
    bass_weight: float = 0.35,
) -> list[dict]:
    """박 단위로 코드를 정하고 같은 코드끼리 묶어 [{start, end, label}] 로 돌려준다. 'N' = 코드 없음.

    bass: bass_by_segment 결과(12 × 구간). 근음이 베이스에서 들리는 코드에 가산점.
    """
    if chroma.shape[1] == 0:
        return []
    seg, bounds = beat_sync(chroma, beat_frames)
    energy = seg.sum(axis=0)
    norm = seg / np.maximum(np.linalg.norm(seg, axis=0, keepdims=True), 1e-9)

    tmpl, labels = _templates()
    scores = tmpl @ norm  # (K, T), 코사인 유사도
    if bass is not None and bass.shape[1] == scores.shape[1]:
        roots = np.array([r for r, _ in labels])
        scores = scores + bass_weight * bass[roots, :]

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

    # 같은 코드가 이어지는 박들을 묶은 뒤, 묶음 단위로 '3도가 정말 들리는가'를 다시 확인한다.
    groups: list[tuple[int, str, list[int]]] = []  # (근음, 품질, 박 인덱스들)
    for i, state in enumerate(path):
        root, quality = labels[state]
        if groups and groups[-1][0] == root and groups[-1][1] == quality:
            groups[-1][2].append(i)
        else:
            groups.append((root, quality, [i]))

    out: list[dict] = []
    for root, quality, idx in groups:
        if root >= 0 and quality in ("", "m", "7") and not third_is_audible(seg[:, idx], root):
            quality = "5"  # 디스토션 잡음 속에서 3도가 안 들리면 파워코드
        label = "N" if root < 0 else chord_label(root, quality)
        start, end = float(times[idx[0]]), float(times[idx[-1] + 1])
        if out and out[-1]["label"] == label:
            out[-1]["end"] = round(end, 3)
        else:
            out.append({"start": round(start, 3), "end": round(end, 3), "label": label})
    return out


def third_is_audible(seg_chroma: np.ndarray, root: int) -> bool:
    """3도(단·장 중 센 쪽)가 잡음 위로 뚜렷이 솟아 있는가.

    디스토션은 모든 음이름에 고르게 잡음을 깐다. 3도 칸 값만 보면 잡음과 진짜 3도를 구분할 수 없어
    '화음 밖 음들의 중앙값'을 잡음 수준으로 삼고, 그 위로 솟은 정도를 두 기준과 비교한다.
    - 5도 대비: 베이스가 근음을 키워도 흔들리지 않는다
    - 근음 대비: 5도가 약한 보이싱에서도 3도가 크면 잡아낸다
    (기준값은 tests/test_distortion.py의 합성 리프에서 파워코드·3화음을 가르는 값)
    """
    c = np.median(seg_chroma, axis=1) if seg_chroma.ndim == 2 else seg_chroma
    if c[root] <= 0:
        return True
    chord_like = {root, (root + 3) % 12, (root + 4) % 12, (root + 7) % 12}
    noise = float(np.median([c[p] for p in range(12) if p not in chord_like]))
    third = max(c[(root + 3) % 12], c[(root + 4) % 12]) - noise
    fifth = c[(root + 7) % 12] - noise
    return third >= 0.32 * max(fifth, 1e-6) or third >= 0.13 * c[root]


def chord_root_profile(chords: list[dict]) -> np.ndarray:
    """코드 근음별 총 길이(초) + 첫·마지막 코드 가중.

    파워코드 진행은 나란한조끼리 구성음이 같아(F#5–D5–A5–E5 = F# 마이너도 A 메이저도 됨) 길이만으로는
    키를 가를 수 없다. 곡은 대개 으뜸화음으로 시작하고 끝나므로 첫·마지막 코드의 근음에 무게를 더 준다.
    """
    from .theory import ROOT_NAMES  # noqa: PLC0415

    played = [c for c in chords if c["label"] != "N"]
    prof = np.zeros(12)
    if not played:
        return prof

    def root(label: str) -> int:
        return ROOT_NAMES.index(label[:2] if len(label) > 1 and label[1] in "#b" else label[:1])

    for c in played:
        prof[root(c["label"])] += c["end"] - c["start"]
    total = prof.sum()
    prof[root(played[0]["label"])] += 0.3 * total
    prof[root(played[-1]["label"])] += 0.15 * total
    return prof


def analyze(path: str, progress: ProgressFn | None = None, bass_path: str | None = None) -> dict:
    report = progress or (lambda _step, _p: None)
    report("음원 읽는 중", 0.05)
    y, sr = load_audio(path)
    bass_y = load_audio(bass_path)[0] if bass_path else None
    return analyze_array(y, sr, report, bass_y)


def analyze_array(y: np.ndarray, sr: int, progress: ProgressFn | None = None, bass_y: np.ndarray | None = None) -> dict:
    report = progress or (lambda _step, _p: None)
    duration = float(len(y) / sr)

    report("박자 찾는 중", 0.2)
    beats = track_beats(y, sr)

    report("화성 분석 중", 0.45)
    tuning = estimate_tuning(y, sr)
    chroma = harmonic_chroma(y, sr, tuning)
    pcs, weight = bass_notes(bass_y if bass_y is not None else y, sr, tuning)
    _, bounds = beat_sync(chroma, beats.beat_frames)
    bass = bass_by_segment(pcs, weight, bounds)
    bass_profile = np.bincount(pcs, weights=weight, minlength=12)
    key = estimate_key(chroma, bass_profile)
    beats.downbeats = refine_downbeats(beats, chroma, bass)

    report("코드 진행 찾는 중", 0.7)
    chords = estimate_chords(chroma, beats.beat_frames, duration, key, sr, bass=bass)
    # 찾은 코드의 근음 분포까지 보고 키를 다시 정한다 — 바뀌면 그 키로 한 번 더
    root_profile = chord_root_profile(chords)
    refined = estimate_key(chroma, bass_profile, root_profile)
    if (refined.tonic, refined.mode) != (key.tonic, key.mode):
        key = refined
        chords = estimate_chords(chroma, beats.beat_frames, duration, key, sr, bass=bass)
    else:
        key = refined

    return {
        "duration": round(duration, 3),
        "bpm": beats.bpm,
        "beatsPerBar": beats.beats_per_bar,
        "beats": [round(float(t), 3) for t in extend_backward(beats.beats)],
        "downbeats": [round(float(t), 3) for t in beats.downbeats],
        "key": {"name": key.name, "tonic": key.tonic, "mode": key.mode, "confidence": key.confidence},
        "chords": chords,
    }
