"""음 받아 적기 — 합성한 기타 소리로 음높이·시작 시각·벤딩, 그리고 HTTP API"""

from __future__ import annotations

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from woodshed_engine import transcribe as tr
from woodshed_engine.transcribe import Note

SR = 44100


def pluck(midi: int, dur: float, rng: np.random.Generator, bend: float = 0.0) -> np.ndarray:
    """Karplus-Strong 현 소리. bend면 0.08초 뒤부터 0.25초 동안 밀어 올린다"""
    f = 440 * 2 ** ((midi - 69) / 12)
    n, p = int(dur * SR), int(SR / f)
    buf = rng.uniform(-1, 1, p)
    out = np.zeros(n)
    for i in range(n):
        out[i] = buf[i % p]
        buf[i % p] = 0.996 * 0.5 * (buf[i % p] + buf[(i + 1) % p])
    if bend:
        t = np.arange(n) / SR
        ratio = 2 ** (np.minimum(np.maximum(t - 0.08, 0) / 0.25, 1) * bend / 12)
        out = np.interp(np.cumsum(ratio), np.arange(n), out, right=0)
    return out


MELODY = [64, 67, 69, 71, 74, 71, 69]  # E 마이너 펜타토닉, 8분음표 (120 BPM)


def melody_wav(path, bend_last: bool = True) -> None:
    rng = np.random.default_rng(0)
    y = np.zeros(int(SR * 3.6))
    seq = [(m, 0.0) for m in MELODY] + ([(67, 2.0)] if bend_last else [])
    for k, (m, b) in enumerate(seq):
        s = int((0.5 + k * 0.25) * SR)
        w = pluck(m, 0.8 if b else 0.25, rng, b)
        y[s : s + len(w)] += w * 0.5
    sf.write(str(path), y.astype(np.float32), SR)


@pytest.fixture(scope="module")
def melody(tmp_path_factory):
    p = tmp_path_factory.mktemp("tr") / "melody.wav"
    melody_wav(p)
    return p


def test_melody_pitches_and_onsets(melody):
    notes = [n for n in tr.transcribe_file(melody, 0.4, 2.2, 40, 88) if n["onset"] >= 0.5]
    assert [n["midi"] for n in notes] == MELODY
    for k, n in enumerate(notes):
        assert abs(n["start"] - (0.5 + k * 0.25)) < 0.03


def test_bend_reaches_target_pitch(melody):
    notes = tr.transcribe_file(melody, 2.2, 3.4, 40, 88)
    bent = [n for n in notes if n["bend"] > 0]
    assert len(bent) == 1
    # 피킹한 67이 짧아서 시작 음은 66–68로 흔들리지만, 도착 음(69)은 맞아야 한다
    assert bent[0]["midi"] + bent[0]["bend"] == 69
    assert abs(bent[0]["start"] - 2.25) < 0.08


def test_range_filters_notes(melody):
    notes = tr.transcribe_file(melody, 0.9, 1.6, 40, 88)
    assert [n["midi"] for n in notes if n["onset"] >= 0.5] == [69, 71, 74]


def test_silence_gives_nothing(tmp_path):
    p = tmp_path / "silence.wav"
    sf.write(str(p), np.zeros(SR * 2, dtype=np.float32), SR)
    assert tr.transcribe_file(p, 0, 2) == []


def n(start, end, midi, amp=0.8, onset=0.9, bend=0.0):
    return Note(start, end, midi, amp, onset, bend)


def test_overtone_ghosts_dropped():
    notes = tr._drop_overtones([n(1.0, 1.3, 40), n(1.01, 1.2, 52, amp=0.3), n(1.0, 1.3, 47, amp=0.7), n(1.5, 1.6, 64, amp=0.2)])
    assert [x.midi for x in notes] == [40, 47, 64]  # 약한 옥타브만 빠지고 5도와 따로 친 음은 남는다


def test_glide_merges_unpicked_continuation():
    merged = tr._merge_glides([n(1.0, 1.2, 67), n(1.2, 1.5, 68, onset=0.3), n(1.5, 1.9, 69, onset=0.6)])
    assert len(merged) == 1
    assert (merged[0].midi, merged[0].bend, merged[0].end) == (67, 2.0, 1.9)


def test_glide_keeps_picked_notes():
    kept = tr._merge_glides([n(1.0, 1.2, 67), n(1.2, 1.5, 69, onset=0.9)])
    assert len(kept) == 2


def test_chord_cancels_bend():
    notes = tr._drop_crowded_bends([n(1.0, 1.5, 64, bend=1.0), n(1.0, 1.5, 65)])
    assert notes[0].bend == 0


# ── HTTP ──


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("WOODSHED_CACHE", str(tmp_path))
    import importlib

    import woodshed_engine.server as server

    importlib.reload(server)
    return TestClient(server.app), tmp_path


def test_api_transcribes_upload(client, melody):
    c, _ = client
    r = c.post("/transcribe", files={"file": ("m.wav", melody.read_bytes(), "audio/wav")}, data={"start": 0.4, "end": 1.4, "min_midi": 40, "max_midi": 88})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["source"] == "mix"
    assert [x["midi"] for x in body["notes"] if x["onset"] >= 0.5] == [64, 67, 69, 71]
    assert c.get("/health").json()["features"]["transcribe"] is True


def test_api_prefers_guitar_stem(client, melody, tmp_path):
    c, cache = client
    upload = melody.read_bytes()
    import hashlib

    stem_dir = cache / "stems" / hashlib.sha1(upload).hexdigest()
    stem_dir.mkdir(parents=True)
    # 분리된 기타 트랙에는 다른 음(옥타브 위)을 넣어 두고, 결과가 그걸 따르는지 본다
    rng = np.random.default_rng(1)
    y = np.zeros(int(SR * 1.5))
    w = pluck(76, 0.4, rng)
    y[int(0.5 * SR) : int(0.5 * SR) + len(w)] = w * 0.5
    sf.write(str(stem_dir / "guitar.flac"), y.astype(np.float32), SR)
    r = c.post("/transcribe", files={"file": ("m.wav", upload, "audio/wav")}, data={"start": 0.3, "end": 1.2})
    assert r.status_code == 200, r.text
    assert r.json()["source"] == "guitar"
    assert [x["midi"] for x in r.json()["notes"] if x["onset"] >= 0.5] == [76]


def test_api_rejects_bad_ranges(client, melody):
    c, _ = client
    f = {"file": ("m.wav", melody.read_bytes(), "audio/wav")}
    assert c.post("/transcribe", files=f, data={"start": 2, "end": 1}).status_code == 400
    assert c.post("/transcribe", files=f, data={"start": 0, "end": 90}).status_code == 400
    assert c.post("/transcribe", files=f, data={"start": 0, "end": 1, "source": "guitar"}).status_code == 400
