"""디스토션 메탈 리프에서도 BPM·키·코드를 맞히는지."""

from __future__ import annotations

import pytest
import soundfile as sf

from synth_metal import SR, metal_riff
from woodshed_engine.analysis import analyze, analyze_array

PROG = ["E5", "C5", "D5", "B5"]  # E 마이너의 i–VI–VII–V (파워코드)


def labels(chords: list[dict]) -> list[str]:
    return [c["label"] for c in chords if c["label"] != "N"]


@pytest.fixture(scope="module")
def full_mix():
    return analyze_array(metal_riff(PROG, bpm=120), SR)


def test_bpm_is_not_halved(full_mix):
    """킥이 1·3박뿐이어도 8분음표 리프·스네어가 있으면 120 (60이 아님)"""
    assert abs(full_mix["bpm"] - 120) < 2


def test_key_from_distorted_riff(full_mix):
    assert full_mix["key"]["name"] == "Em"


def test_power_chords_in_distorted_mix(full_mix):
    assert labels(full_mix["chords"])[:4] == PROG


def test_chord_changes_on_bar_lines(full_mix):
    bar = 60 / 120 * 4
    for c in [c for c in full_mix["chords"] if c["label"] != "N"][1:5]:
        assert abs(c["start"] / bar - round(c["start"] / bar)) * bar < 0.15


def test_guitar_only_without_bass():
    """베이스 없이 기타 + 드럼만 있어도 근음을 찾는다"""
    r = analyze_array(metal_riff(PROG, bpm=120, bass=False), SR)
    assert labels(r["chords"])[:4] == PROG


@pytest.mark.parametrize("bpm", [100, 140, 170])
def test_tempo_octave_across_tempos(bpm):
    r = analyze_array(metal_riff(["E5", "G5", "A5", "C5"], bpm=bpm, repeats=2), SR)
    assert abs(r["bpm"] - bpm) < bpm * 0.03


def test_other_key_drop_d_style():
    """D 마이너 리프 (Dm 키: D5–Bb5–C5–A5)"""
    r = analyze_array(metal_riff(["D5", "Bb5", "C5", "A5"], bpm=130), SR)
    assert r["key"]["name"] == "Dm"
    assert labels(r["chords"])[:4] == ["D5", "Bb5", "C5", "A5"]


def test_bass_stem_helps(tmp_path):
    """기타 분리를 했다면 '기타 뺀 트랙'의 베이스로 근음을 찾는다"""
    mix = metal_riff(PROG, bpm=120, drive=8.0)
    backing = metal_riff(PROG, bpm=120, drive=0.0001)  # 기타가 거의 안 들리는 반주 트랙 흉내
    p_mix, p_backing = tmp_path / "mix.wav", tmp_path / "backing.wav"
    sf.write(p_mix, mix, SR)
    sf.write(p_backing, backing, SR)
    r = analyze(str(p_mix), bass_path=str(p_backing))
    assert labels(r["chords"])[:4] == PROG
    assert r["key"]["name"] == "Em"


@pytest.mark.parametrize("drive", [2.0, 8.0])
def test_power_chords_across_drive_levels(drive):
    r = analyze_array(metal_riff(PROG, bpm=120, drive=drive, seed=3), SR)
    assert labels(r["chords"])[:4] == PROG
    assert r["key"]["name"] == "Em"


def test_distorted_triads_keep_their_third():
    """디스토션을 걸어도 3도를 실제로 치면 파워코드로 바꾸지 않는다"""
    r = analyze_array(metal_riff(["Em", "C", "D", "B"], bpm=120, drive=3.0), SR)
    assert labels(r["chords"])[:4] == ["Em", "C", "D", "B"]


def test_two_bars_per_chord_at_95_bpm():
    r = analyze_array(metal_riff(["A5", "F5", "G5", "E5"], bpm=95, bars_per_chord=2, repeats=1), SR)
    assert abs(r["bpm"] - 95) < 3
    assert r["key"]["name"] == "Am"
    assert labels(r["chords"])[:4] == ["A5", "F5", "G5", "E5"]
