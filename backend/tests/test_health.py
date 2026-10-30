from fastapi.testclient import TestClient

from texscan.main import app


def test_health() -> None:
    with TestClient(app) as client:
        res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
