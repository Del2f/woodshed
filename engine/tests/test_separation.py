"""분리 모델 선택과 '예전 모델로 만든 트랙은 다시 만들기' — 실제 분리(GPU)는 하지 않는다"""

from __future__ import annotations

import json

import pytest

from woodshed_engine import separation


@pytest.fixture()
def roformer(monkeypatch):
    monkeypatch.setattr(separation, "current", lambda: separation.ROFORMER)


def make_stems(d, marker: str | None):
    d.mkdir(parents=True, exist_ok=True)
    for s in separation.STEMS:
        (d / f"{s}.flac").write_bytes(b"x")
    if marker:
        (d / "separator.txt").write_text(marker, encoding="utf-8")


def test_stems_ready_needs_current_model(tmp_path, roformer):
    make_stems(tmp_path / "a", separation.ROFORMER)
    make_stems(tmp_path / "b", separation.DEMUCS)
    make_stems(tmp_path / "c", None)  # 표시가 없는 건 0.3 이전(Demucs)에 만든 것
    assert separation.stems_ready(tmp_path / "a")
    assert not separation.stems_ready(tmp_path / "b")
    assert not separation.stems_ready(tmp_path / "c")


def test_ready_stems_are_reused(tmp_path, roformer, monkeypatch):
    make_stems(tmp_path, separation.ROFORMER)
    monkeypatch.setattr(separation, "_separate_roformer", lambda *a: pytest.fail("다시 분리하면 안 됨"))
    out = separation.separate_guitar(tmp_path / "song.wav", tmp_path)
    assert out["guitar"] == tmp_path / "guitar.flac"


def test_old_model_stems_are_redone(tmp_path, roformer, monkeypatch):
    make_stems(tmp_path, separation.DEMUCS)
    calls = []
    monkeypatch.setattr(separation, "_separate_roformer", lambda audio, out, report: calls.append(out))
    separation.separate_guitar(tmp_path / "song.wav", tmp_path)
    assert calls == [tmp_path]
    assert (tmp_path / "separator.txt").read_text(encoding="utf-8") == separation.ROFORMER


def test_forced_demucs(monkeypatch):
    monkeypatch.setenv("WOODSHED_SEPARATOR", separation.DEMUCS)
    import importlib.util

    if importlib.util.find_spec("demucs") is None:
        pytest.skip("demucs 없음")
    assert separation.current() == separation.DEMUCS


def test_cached_result_with_old_separator_is_redone(tmp_path, monkeypatch):
    monkeypatch.setenv("WOODSHED_CACHE", str(tmp_path))
    import importlib

    import woodshed_engine.server as server

    importlib.reload(server)
    monkeypatch.setattr(server.separation, "current", lambda: separation.ROFORMER)
    h = "a" * 40
    path = tmp_path / "results" / f"{h}.json"
    path.parent.mkdir(parents=True)
    data = {"version": server.ANALYSIS_VERSION, "stems": ["guitar", "no_guitar"], "separator": separation.DEMUCS}
    path.write_text(json.dumps(data), encoding="utf-8")
    assert server._cached(h, separate=True) is None  # 새 모델로 다시 분리
    assert server._cached(h, separate=False) == data  # 분리 없이 분석만이면 그대로
    data["separator"] = separation.ROFORMER
    path.write_text(json.dumps(data), encoding="utf-8")
    assert server._cached(h, separate=True) == data
