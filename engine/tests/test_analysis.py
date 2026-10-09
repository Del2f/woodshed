"""합성한 음원으로 박자·키·코드 분석이 맞는지 확인한다."""

from __future__ import annotations

import numpy as np
import pytest

from woodshed_engine.analysis import SR, estimate_chords, estimate_key, harmonic_chroma, track_beats
from woodshed_engine.theory import CHORD_QUALITIES, ROOT_NAMES

BPM = 120
BEAT = 60 / BPM


def midi_hz(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


def chord_tones(label: str) -> list[int]:
    """'Em' → MIDI 번호 (근음은 E3 근처)"""
    root_name = label[:2] if len(label) > 1 and label[1] in "#b" else label[:1]
    quality = label[len(root_name):]
    root = ROOT_NAMES.index(root_name)
    base = 48 + root  # C3 부근
    return [base + iv for iv in CHORD_QUALITIES[quality]] + [base + 12]


def render(progression: list[str], beats_per_chord: int = 4, repeats: int = 2) -> np.ndarray:
    """기타 같은 배음 + 박마다 킥(첫 박은 더 세게)"""
    n_beats = len(progression) * beats_per_chord * repeats
    y = np.zeros(int(n_beats * BEAT * SR) + SR)
    t_beat = np.arange(int(BEAT * SR)) / SR
    for b in range(n_beats):
        label = progression[(b // beats_per_chord) % len(progression)]
        start = int(b * BEAT * SR)
        env = np.exp(-t_beat * 2.5)
        tone = np.zeros_like(t_beat)
        for m in chord_tones(label):
            f = midi_hz(m)
            tone += sum(w * np.sin(2 * np.pi * f * h * t_beat) for h, w in ((1, 1.0), (2, 0.5), (3, 0.25)))
        y[start : start + len(t_beat)] += 0.08 * env * tone
        # 킥: 60Hz 짧은 버스트
        kick_len = int(0.12 * SR)
        kt = np.arange(kick_len) / SR
        accent = 1.0 if b % 4 == 0 else 0.45
        y[start : start + kick_len] += accent * 0.6 * np.exp(-kt * 30) * np.sin(2 * np.pi * 60 * kt)
    return (y / np.max(np.abs(y)) * 0.9).astype(np.float32)


@pytest.fixture(scope="module")
def metal_progression():
    prog = ["Em", "C", "D", "B7"]
    y = render(prog)
    beats = track_beats(y, SR)
    chroma = harmonic_chroma(y, SR)
    key = estimate_key(chroma)
    chords = estimate_chords(chroma, beats.beat_frames, len(y) / SR, key, SR)
    return prog, y, beats, key, chords


def test_bpm(metal_progression):
    _, _, beats, _, _ = metal_progression
    assert abs(beats.bpm - BPM) < 1


def test_key_is_e_minor(metal_progression):
    _, _, _, key, _ = metal_progression
    assert key.name == "Em"


def test_chord_sequence(metal_progression):
    prog, _, _, _, chords = metal_progression
    labels = [c["label"] for c in chords if c["label"] != "N"]
    assert labels[:8] == prog * 2


def test_chord_changes_line_up_with_bars(metal_progression):
    _, _, _, _, chords = metal_progression
    starts = [c["start"] for c in chords if c["label"] != "N"][1:6]
    bar = BEAT * 4
    for s in starts:
        assert abs(s / bar - round(s / bar)) * bar < 0.15


def test_downbeats_on_bar_starts(metal_progression):
    _, _, beats, _, _ = metal_progression
    bar = BEAT * 4
    for t in beats.downbeats[:6]:
        assert abs(t / bar - round(t / bar)) * bar < 0.1


def test_power_chords_detected():
    """3도 없는 파워코드 리프는 '5' 코드로"""
    y = render(["E5", "G5", "A5", "C5"], repeats=1)
    beats = track_beats(y, SR)
    chroma = harmonic_chroma(y, SR)
    chords = estimate_chords(chroma, beats.beat_frames, len(y) / SR, estimate_key(chroma), SR)
    labels = [c["label"] for c in chords if c["label"] != "N"]
    assert labels[:4] == ["E5", "G5", "A5", "C5"]


def test_major_key():
    y = render(["G", "D", "Em", "C"], repeats=1)
    assert estimate_key(harmonic_chroma(y, SR)).name in ("G", "Em")  # 나란한조는 구분이 어려워 둘 다 허용


# 기타로 실제 잡는 모양 (낮은 줄 → 높은 줄 MIDI). 근음·5도가 겹쳐 3도가 상대적으로 약하다.
GUITAR_VOICINGS = {
    "Em": [40, 47, 52, 55, 59, 64],  # 오픈 Em
    "C": [48, 52, 55, 60, 64],  # 오픈 C
    "D": [50, 57, 62, 66],  # 오픈 D
    "B7": [47, 51, 57, 59, 66],  # 오픈 B7
}


def render_voicings(progression: list[str], accent: bool, repeats: int = 2) -> np.ndarray:
    n_beats = len(progression) * 4 * repeats
    y = np.zeros(int(n_beats * BEAT * SR) + SR)
    t_beat = np.arange(int(BEAT * SR)) / SR
    for b in range(n_beats):
        label = progression[(b // 4) % len(progression)]
        start = int(b * BEAT * SR)
        env = np.exp(-t_beat * 2.5)
        tone = sum(
            w * np.sin(2 * np.pi * midi_hz(m) * h * t_beat) for m in GUITAR_VOICINGS[label] for h, w in ((1, 1.0), (2, 0.5), (3, 0.25))
        )
        y[start : start + len(t_beat)] += 0.06 * env * tone
        kick_len = int(0.12 * SR)
        kt = np.arange(kick_len) / SR
        level = (1.0 if b % 4 == 0 else 0.45) if accent else 0.7
        y[start : start + kick_len] += level * 0.6 * np.exp(-kt * 30) * np.sin(2 * np.pi * 60 * kt)
    return (y / np.max(np.abs(y)) * 0.9).astype(np.float32)


def analyze_array(y: np.ndarray):
    from woodshed_engine.analysis import refine_downbeats

    beats = track_beats(y, SR)
    chroma = harmonic_chroma(y, SR)
    key = estimate_key(chroma)
    beats.downbeats = refine_downbeats(beats, chroma)
    chords = estimate_chords(chroma, beats.beat_frames, len(y) / SR, key, SR)
    return beats, key, chords


def test_open_chord_em_is_minor_not_power_chord():
    """오픈 Em은 G가 한 번뿐이어도 E5가 아니라 Em"""
    _, _, chords = analyze_array(render_voicings(["Em", "C", "D", "B7"], accent=True))
    labels = [c["label"] for c in chords if c["label"] != "N"]
    assert labels[:4] == ["Em", "C", "D", "B7"]


def test_downbeats_follow_chord_changes_without_accent():
    """킥이 매 박 같은 세기여도 코드가 바뀌는 박을 마디 첫 박으로"""
    beats, _, _ = analyze_array(render_voicings(["Em", "C", "D", "B7"], accent=False))
    bar = BEAT * 4
    for t in beats.downbeats[:6]:
        assert abs(t / bar - round(t / bar)) * bar < 0.1


def test_first_bar_is_not_lost():
    """곡이 0초에 바로 시작하면 첫 마디도 0초 근처에 있어야 한다 (마디 번호가 밀리지 않게)"""
    from woodshed_engine.analysis import extend_backward

    beats, _, _ = analyze_array(render_voicings(["Em", "C", "D", "B7"], accent=False))
    assert beats.downbeats[0] < 0.15
    assert list(extend_backward(np.array([2.04, 4.04, 6.04]))) == pytest.approx([0.04, 2.04, 4.04, 6.04])
    assert list(extend_backward(np.array([0.6, 2.6]))) == pytest.approx([0.6, 2.6])  # 앞에 마디가 들어갈 자리 없음
