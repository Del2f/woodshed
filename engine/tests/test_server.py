"""엔진 HTTP API — 분석 요청부터 결과·캐시·CORS까지"""

from __future__ import annotations

import io
import time

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("WOODSHED_CACHE", str(tmp_path))
    import importlib

    import woodshed_engine.server as server

    importlib.reload(server)
    return TestClient(server.app)


def wav_bytes(seconds: float = 6.0) -> bytes:
    sr = 22050
    t = np.arange(int(seconds * sr)) / sr
    y = 0.3 * np.sin(2 * np.pi * 82.41 * t) * np.exp(-((t * 2) % 1) * 3)
    buf = io.BytesIO()
    sf.write(buf, y.astype(np.float32), sr, format="WAV")
    return buf.getvalue()


def wait_done(client: TestClient, job_id: str) -> dict:
    for _ in range(300):
        job = client.get(f"/jobs/{job_id}").json()
        if job["status"] in ("done", "error"):
            return job
        time.sleep(0.1)
    raise AssertionError("분석이 끝나지 않았어요")


def test_health(client):
    body = client.get("/health").json()
    assert body["ok"] is True
    assert "separation" in body["features"]


def test_analyze_then_cache(client):
    data = wav_bytes()
    job = client.post("/analyze", files={"file": ("riff.wav", data, "audio/wav")}).json()
    done = wait_done(client, job["id"])
    assert done["status"] == "done", done["error"]
    result = done["result"]
    assert result["version"] == 3
    assert result["duration"] == pytest.approx(6.0, abs=0.05)
    assert result["chords"] and result["beats"]

    # 같은 파일은 바로 이전 결과를 돌려준다
    again = client.post("/analyze", files={"file": ("riff.wav", data, "audio/wav")}).json()
    assert again["status"] == "done"
    assert again["result"]["fileHash"] == result["fileHash"]


def test_cors_allows_site_and_private_network(client):
    r = client.options(
        "/analyze",
        headers={
            "Origin": "https://del2f.github.io",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Private-Network": "true",
        },
    )
    assert r.headers.get("access-control-allow-origin") == "https://del2f.github.io"
    assert r.headers.get("access-control-allow-private-network") == "true"


def test_cors_rejects_other_sites(client):
    r = client.options("/analyze", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
    assert r.headers.get("access-control-allow-origin") is None


def test_stem_path_is_validated(client):
    assert client.get("/stems/../../etc/guitar").status_code == 404
    assert client.get(f"/stems/{'a' * 40}/vocals").status_code == 404
