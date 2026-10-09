"""음 이름·키·코드 표기 — 프런트엔드(src/lib/theory.ts)와 같은 철자를 쓴다."""

from __future__ import annotations

# 키 선택 목록과 맞춘 철자 (src/lib/format.ts KEY_OPTIONS)
MAJOR_KEY_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
MINOR_KEY_NAMES = ["Cm", "C#m", "Dm", "Ebm", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "Bbm", "Bm"]

# 코드 근음 철자 — 기타 연주자에게 익숙한 쪽
ROOT_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]

# 품질별 구성음(근음 기준 반음 수)
CHORD_QUALITIES: dict[str, list[int]] = {
    "": [0, 4, 7],  # 메이저
    "m": [0, 3, 7],  # 마이너
    "7": [0, 4, 7, 10],  # 도미넌트 7
    "5": [0, 7],  # 파워코드
}


def key_name(tonic: int, mode: str) -> str:
    return (MAJOR_KEY_NAMES if mode == "major" else MINOR_KEY_NAMES)[tonic % 12]


def chord_label(root: int, quality: str) -> str:
    return f"{ROOT_NAMES[root % 12]}{quality}"


def diatonic_chords(tonic: int, mode: str) -> set[tuple[int, str]]:
    """키 안의 코드(근음, 품질). 마이너 키는 하모닉 마이너의 V·V7도 포함 — 메탈·록에서 흔하다."""
    if mode == "major":
        steps = [(0, ""), (2, "m"), (4, "m"), (5, ""), (7, ""), (9, "m")]
        extra = [(7, "7")]
    else:
        steps = [(0, "m"), (3, ""), (5, "m"), (7, "m"), (8, ""), (10, "")]
        extra = [(7, ""), (7, "7")]
    out = {((tonic + s) % 12, q) for s, q in steps + extra}
    # 파워코드는 3도가 없으니 근음이 키 안이면 어울린다
    scale = [0, 2, 4, 5, 7, 9, 11] if mode == "major" else [0, 2, 3, 5, 7, 8, 10]
    out |= {((tonic + s) % 12, "5") for s in scale}
    return out
