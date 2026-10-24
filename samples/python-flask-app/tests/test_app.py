import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app  # noqa: E402


def client():
    app.config["TESTING"] = True
    return app.test_client()


def test_index_returns_200():
    res = client().get("/")
    assert res.status_code == 200
    assert b"Flask" in res.data


def test_health():
    res = client().get("/health")
    assert res.status_code == 200
    assert res.get_json() == {"status": "ok"}
