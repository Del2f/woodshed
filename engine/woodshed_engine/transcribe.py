"""음 받아 적기 — 오디오 구간에서 음(시작·끝·음높이·벤딩)을 찾는다.

Spotify의 Basic Pitch 모델(Apache-2.0, models/LICENSE-basic-pitch.txt)을 ONNX로 돌린다.
공식 패키지는 Windows + Python 3.12에서 설치되지 않아서(TensorFlow 고정 버전) 모델 파일만 쓰고,
창 나누기·이어 붙이기와 음 찾기는 원본 코드(basic_pitch/inference.py, note_creation.py)를 따라 다시 짰다.
원본과 다른 점: 시작점 없이 이어지는 소리로 음을 만드는 'melodia' 단계는 뺐다 — 기타 타브에서는
잡음이 더 많이 생긴다. 대신 음마다 시작 세기(onset)를 돌려줘서 브라우저에서 민감도를 고를 수 있다.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from scipy.signal import argrelmax
from scipy.signal.windows import gaussian

SR = 22050
HOP = 256
FPS = SR // HOP  # 86 — 원본도 정수로 내림
WIN = SR * 2 - HOP  # 43844 샘플 = 모델 한 번 입력
WIN_FRAMES = FPS * 2  # 172
OLAP_FRAMES = 30
OLAP = OLAP_FRAMES * HOP
WIN_HOP = WIN - OLAP
MIDI_OFFSET = 21  # 출력 0번 = A0
N_NOTES = 88
CONTOUR_BINS = 3  # 반음당 칸

MODEL_PATH = Path(__file__).parent / "models" / "basic_pitch_nmp.onnx"

_session = None
_session_lock = threading.Lock()


def available() -> bool:
    try:
        import onnxruntime  # noqa: F401, PLC0415
    except ImportError:
        return False
    return MODEL_PATH.exists()


def _model():
    global _session
    with _session_lock:
        if _session is None:
            import onnxruntime as ort  # noqa: PLC0415

            opts = ort.SessionOptions()
            opts.log_severity_level = 3
            _session = ort.InferenceSession(str(MODEL_PATH), opts, providers=["CPUExecutionProvider"])
        return _session


def model_output(audio: np.ndarray) -> dict[str, np.ndarray]:
    """22050Hz 모노 → {'note','onset': (프레임, 88), 'contour': (프레임, 264)}"""
    audio = np.asarray(audio, dtype=np.float32)
    n = len(audio)
    padded = np.concatenate([np.zeros(OLAP // 2, dtype=np.float32), audio])
    windows = []
    for i in range(0, len(padded), WIN_HOP):
        w = padded[i : i + WIN]
        if len(w) < WIN:
            w = np.pad(w, (0, WIN - len(w)))
        windows.append(w)
    batch = np.stack(windows)[:, :, None]
    sess = _model()
    outs: dict[str, list[np.ndarray]] = {"note": [], "onset": [], "contour": []}
    for b in range(0, len(batch), 16):
        note, onset, contour = sess.run(
            ["StatefulPartitionedCall:1", "StatefulPartitionedCall:2", "StatefulPartitionedCall:0"],
            {"serving_default_input_2:0": batch[b : b + 16]},
        )
        outs["note"].append(note)
        outs["onset"].append(onset)
        outs["contour"].append(contour)
    n_frames = int(np.floor(n * (FPS / SR)))
    half = OLAP_FRAMES // 2
    result = {}
    for k, parts in outs.items():
        arr = np.concatenate(parts)[:, half:-half, :]
        result[k] = arr.reshape(-1, arr.shape[2])[:n_frames]
    return result


def frame_times(n_frames: int) -> np.ndarray:
    """프레임 → 초. 창마다 조금씩 밀리는 만큼 원본과 같은 보정값을 뺀다"""
    idx = np.arange(n_frames)
    offset = (HOP / SR) * (WIN_FRAMES - WIN / HOP) + 0.0018
    return idx * HOP / SR - offset * np.floor(idx / WIN_FRAMES)


@dataclass
class Note:
    start: float
    end: float
    midi: int
    amp: float
    onset: float  # 시작 세기 0–1 — 클수록 확실한 음
    bend: float  # 가장 크게 올라간 폭(반음, 0.5 단위). 0이면 벤딩 없음

    def public(self) -> dict:
        return {
            "start": round(self.start, 4),
            "end": round(self.end, 4),
            "midi": self.midi,
            "amp": round(self.amp, 3),
            "onset": round(self.onset, 3),
            "bend": self.bend,
        }


def _inferred_onsets(onsets: np.ndarray, frames: np.ndarray, n_diff: int = 2) -> np.ndarray:
    """프레임 세기가 갑자기 커지는 곳도 시작점으로 (원본 get_infered_onsets)"""
    diffs = []
    for k in range(1, n_diff + 1):
        shifted = np.concatenate([np.zeros((k, frames.shape[1])), frames])
        diffs.append(shifted[k:] - shifted[:-k])
    diff = np.min(diffs, axis=0)
    diff[diff < 0] = 0
    diff[:n_diff] = 0
    if diff.max() > 0:
        diff = onsets.max() * diff / diff.max()
    return np.maximum(onsets, diff)


def _pitch_track(contour: np.ndarray, s: int, e: int, midi: int) -> np.ndarray:
    """음 구간의 프레임별 음높이 — midi 기준 ±4반음 안에서 가장 센 곳(반음 단위)"""
    tol = 12
    center = int(round(CONTOUR_BINS * (midi - MIDI_OFFSET)))
    lo, hi = max(0, center - tol), min(contour.shape[1], center + tol + 1)
    weight = gaussian(2 * tol + 1, std=4)[lo - (center - tol) : hi - (center - tol)]
    sub = contour[s:e, lo:hi] * weight
    return (np.argmax(sub, axis=1) + lo - center) / CONTOUR_BINS


def _bend(contour: np.ndarray, s: int, e: int, midi: int) -> tuple[int, float]:
    """(피킹한 음, 벤딩 폭). 아래에서 밀어 올린 음이면 시작 음높이를 피킹한 음으로 본다. 폭은 반음 0.5 단위"""
    offs = _pitch_track(contour, s, e, midi)
    if len(offs) < 4:
        return midi, 0.0
    start = float(np.median(offs[:3]))
    base = midi + int(round(start)) if start <= -0.75 else midi
    # 짧게 튀는 값 무시: 3프레임 동안 유지된 최고치
    top = max(float(np.min(offs[i : i + 3])) for i in range(len(offs) - 2)) + midi
    width = top - base
    if width < 0.75:
        return base, 0.0
    return base, float(min(2.0, round(width * 2) / 2))


def output_to_notes(
    out: dict[str, np.ndarray],
    onset_thresh: float = 0.3,
    frame_thresh: float = 0.3,
    min_note_sec: float = 0.05,
    min_midi: int = 21,
    max_midi: int = 108,
    energy_tol: int = 11,
) -> list[Note]:
    frames = out["note"].copy()
    raw_onsets = out["onset"]
    onsets = raw_onsets.copy()
    contour = out["contour"]
    n_frames = len(frames)
    if n_frames < 3:
        return []
    lo, hi = max(0, min_midi - MIDI_OFFSET), min(N_NOTES, max_midi - MIDI_OFFSET + 1)
    frames[:, :lo] = 0
    frames[:, hi:] = 0
    onsets[:, :lo] = 0
    onsets[:, hi:] = 0
    onsets = _inferred_onsets(onsets, frames)

    peaks = np.zeros_like(onsets)
    idx = argrelmax(onsets, axis=0)
    peaks[idx] = onsets[idx]
    t_idx, f_idx = np.where(peaks >= onset_thresh)
    min_len = int(round(min_note_sec * FPS))
    remaining = frames.copy()
    times = frame_times(n_frames)
    notes: list[Note] = []
    # 원본처럼 뒤에서부터 — 나중 음이 앞 음의 꼬리를 먹지 않게
    for s, f in zip(t_idx[::-1], f_idx[::-1]):
        if s >= n_frames - 1:
            continue
        i, k = s + 1, 0
        while i < n_frames - 1 and k < energy_tol:
            k = k + 1 if remaining[i, f] < frame_thresh else 0
            i += 1
        i -= k
        if i - s <= min_len:
            continue
        remaining[s:i, max(0, f - 1) : f + 2] = 0
        base, bend = _bend(contour, s, i, int(f + MIDI_OFFSET))
        notes.append(
            Note(
                start=float(times[s]),
                end=float(times[min(i, n_frames - 1)]),
                midi=base,
                amp=float(np.mean(frames[s:i, f])),
                # 모델이 직접 본 시작 세기 — 피킹한 음은 크고, 벤딩·레가토로 이어진 음은 작다
                onset=float(raw_onsets[max(0, s - 1) : s + 3, f].max()),
                bend=bend,
            )
        )
    notes.sort(key=lambda x: (x.start, x.midi))
    return _drop_crowded_bends(_drop_overtones(_merge_glides(notes)))


# 근음 위로 생기는 배음 간격(반음): 옥타브, 옥타브+5도, 두 옥타브, 두 옥타브+장3도, 두 옥타브+5도
OVERTONES = (12, 19, 24, 28, 31)


def _drop_overtones(notes: list[Note]) -> list[Note]:
    """같은 때 시작한 훨씬 센 음의 배음 자리에 있는 약한 음은 지운다"""
    keep = []
    for n in notes:
        ghost = any(
            abs(o.start - n.start) < 0.035 and (n.midi - o.midi) in OVERTONES and n.amp < 0.6 * o.amp
            for o in notes
            if o is not n
        )
        if not ghost:
            keep.append(n)
    return keep


def _drop_crowded_bends(notes: list[Note]) -> list[Note]:
    """바로 위 음(벤딩 도착 음 근처)이 같이 울리고 있으면 벤딩이 아니라 화음 — 벤딩 표시를 지운다"""
    for n in notes:
        if not n.bend:
            continue
        for o in notes:
            overlap = min(n.end, o.end) - max(n.start, o.start)
            if o is not n and n.midi < o.midi <= n.midi + n.bend + 1 and overlap > 0.5 * (n.end - n.start):
                n.bend = 0.0
                break
    return notes


def _merge_glides(notes: list[Note]) -> list[Note]:
    """앞 음이 끝나자마자 피킹 없이(시작 세기 약함) 0–3반음 위에서 이어지는 음은
    벤딩·서스테인이 따로 잡힌 것으로 보고 앞 음에 합친다"""
    out: list[Note] = []
    for n in notes:
        top = n.midi + n.bend
        prev = next(
            (
                p
                for p in reversed(out)
                if 0 <= top - p.midi <= 3 and n.midi >= p.midi and -0.02 <= n.start - p.end < 0.04 and n.onset < 0.7
            ),
            None,
        )
        if prev is not None:
            prev.end = max(prev.end, n.end)
            prev.bend = max(prev.bend, float(top - prev.midi))
            # 이어진 조각 중 가장 확실한 값으로 — 첫 조각이 약하게 잡혀도 민감도 거르기에서 살아남게
            prev.onset = max(prev.onset, n.onset)
            prev.amp = max(prev.amp, n.amp)
        else:
            out.append(n)
    return out


def load_segment(path: str | Path, start: float, end: float) -> np.ndarray:
    """파일에서 [start, end) 구간만 22050Hz 모노로"""
    import librosa  # noqa: PLC0415
    import soundfile as sf  # noqa: PLC0415

    from .audio_io import read_audio  # noqa: PLC0415

    path = Path(path)
    data: np.ndarray | None = None
    sr = 0
    try:
        with sf.SoundFile(str(path)) as f:
            sr = f.samplerate
            f.seek(max(0, int(start * sr)))
            data = f.read(max(1, int((end - start) * sr)), dtype="float32", always_2d=True)
    except Exception:  # noqa: BLE001 — MP3 등은 통째로 읽어서 자른다
        data = None
    if data is None or not len(data):
        full, sr = read_audio(path)
        data = full[max(0, int(start * sr)) : int(end * sr)]
    mono = data.mean(axis=1)
    if sr != SR:
        mono = librosa.resample(mono, orig_sr=sr, target_sr=SR)
    return mono.astype(np.float32)


PAD = 0.25  # 구간 앞뒤로 조금 더 읽어서 경계의 음도 제대로 잡는다


def transcribe_file(path: str | Path, start: float, end: float, min_midi: int = 21, max_midi: int = 108) -> list[dict]:
    """곡 시간 기준 음 목록. 구간 시작 직전(0.05초)부터 끝 전까지 시작한 음만"""
    seg_start = max(0.0, start - PAD)
    audio = load_segment(path, seg_start, end + PAD)
    peak = float(np.max(np.abs(audio))) if len(audio) else 0.0
    if peak < 1e-4:
        return []
    audio = audio / peak * 0.9  # 녹음 크기와 상관없이 같은 기준으로
    notes = output_to_notes(model_output(audio), min_midi=min_midi, max_midi=max_midi)
    res = []
    for n in notes:
        t = n.start + seg_start
        if start - 0.05 <= t < end - 0.03:
            n.start, n.end = t, min(n.end + seg_start, end + PAD)
            res.append(n.public())
    return res
