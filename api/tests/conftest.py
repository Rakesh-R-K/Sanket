import shutil

import pytest
from fastapi.testclient import TestClient

from app import db, seed
from app.main import app


@pytest.fixture(scope="session")
def seedDb(tmp_path_factory):
    path = tmp_path_factory.mktemp("seed") / "sanket.db"
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(db, "dbPath", path)
        seed.run()
    return path


@pytest.fixture
def client(seedDb, tmp_path, monkeypatch):
    path = tmp_path / "sanket.db"
    shutil.copyfile(seedDb, path)
    monkeypatch.setattr(db, "dbPath", path)
    with TestClient(app, base_url="http://127.0.0.1") as client:
        yield client
