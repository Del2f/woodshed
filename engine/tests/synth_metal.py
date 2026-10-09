"""디스토션 기타 리프 합성기 — 실제 메탈 믹스처럼 배음이 뒤섞인 시험 음원을 만든다.

- 기타: 근음+5도+옥타브 톱니파를 tanh로 세게 찌그러뜨린 8분음표 팜뮤트 파워코드
- 베이스: 근음 한 옥타브 아래 (선택)
- 드럼: 킥 1·3박, 스네어 2·4박, 하이햇 8분음표 (선택)
"""

from __future__ import annotations

import numpy as np

SR = 22050

NOTE = {"C": 0, "C#": 1, "D": 2, "Eb": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "Ab": 8, "A": 9, "Bb": 10, "B": 11}


def hz(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


def root_midi(label: str) -> int:
    """'E5' → E2(40) 근처의 기타 저음 근음"""
    name = label[:2] if len(label) > 1 and label[1] in "#b" else label[:1]
    m = 36 + NOTE[name]  # C2..B2
    return m + 12 if m < 38 else m  # Drop D(38) 아래로는 안 내려감


def metal_riff(
    progression: list[str],
    bpm: float = 120,
    bars_per_chord: int = 1,
    repeats: int = 2,
    bass: bool = True,
    drums: bool = True,
    drive: float = 4.0,
    seed: int = 0,
) -> np.ndarray:
    beat = 60.0 / bpm
    n_beats = len(progression) * bars_per_chord * 4 * repeats
    n = int(n_beats * beat * SR) + SR // 2
    t = np.arange(n) / SR
    guitar = np.zeros(n)
    low = np.zeros(n)
    kit = np.zeros(n)
    rng = np.random.default_rng(seed)

    for b in range(n_beats):
        label = progression[(b // (4 * bars_per_chord)) % len(progression)]
        r = root_midi(label)
        # '5' = 파워코드, 'm' = 단3도 추가, 그 외 = 장3도 추가 (3도는 한 옥타브 위에서)
        quality = label[len(label.rstrip("5m")) :] if label.endswith(("5", "m")) else ""
        voicing = [r, r + 7, r + 12] + ([] if quality == "5" else [r + 15] if quality == "m" else [r + 16])
        s = int(b * beat * SR)
        e = min(n, s + int(beat * SR))
        tt = t[s:e] - t[s]
        for half in (0, 1):  # 8분음표 두 번
            hs = int(half * beat / 2 * SR)
            seg = tt[hs:] - tt[hs]
            wave = sum(2 * ((seg * hz(m)) % 1) - 1 for m in voicing)
            env = np.exp(-seg * 6)
            guitar[s + hs : e] += np.tanh(drive * wave * env) * 0.3
        if bass:
            low[s:e] += np.sin(2 * np.pi * hz(r - 12) * tt) * np.exp(-tt * 3) * 0.5
        if drums:
            if b % 2 == 0:
                kit[s:e] += np.sin(2 * np.pi * (50 + 80 * np.exp(-tt * 40)) * tt) * np.exp(-tt * 12) * 0.8
            else:
                kit[s:e] += rng.normal(0, 1, len(tt)) * np.exp(-tt * 18) * 0.35
            for half in (0, 1):
                hs = int(half * beat / 2 * SR)
                ht = tt[hs:] - tt[hs]
                kit[s + hs : e] += rng.normal(0, 1, len(ht)) * np.exp(-ht * 60) * 0.08

    mix = guitar + low + kit
    return (mix / np.max(np.abs(mix)) * 0.9).astype(np.float32)
