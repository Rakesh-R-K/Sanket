from datetime import date, timedelta

import pytest

from app import db


txn = dict(enterprise_id=1, type="income", amount=875, entered_at="2026-07-18")


@pytest.mark.parametrize("change", [
    {"amount": 0}, {"amount": -1}, {"amount": 100_000_001}, {"amount": 1.001},
    {"entered_at": "2026-02-31"}, {"entered_at": (date.today() + timedelta(days=1)).isoformat()},
    {"type": "transfer"}, {"source": "simulated"}, {"note": "x" * 501},
])
def test_invalid_entries_are_rejected(client, change):
    assert client.post("/transactions/batch", json=[{**txn, **change}]).status_code == 422


def test_invalid_batch_does_not_save_partly(client):
    with db.connect() as con:
        before = con.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]
    assert client.post("/transactions/batch", json=[txn, {**txn, "enterprise_id": 99999}]).status_code == 404
    with db.connect() as con:
        assert con.execute("SELECT COUNT(*) FROM transactions").fetchone()[0] == before
    assert client.post("/transactions/batch", json=[]).status_code == 422
    assert client.post("/transactions/batch", json=[txn] * 101).status_code == 422


@pytest.mark.parametrize("change", [{"name": "  "}, {"members": 0}, {"sector": "mining"}, {"village": ""}])
def test_invalid_enterprises_are_rejected(client, change):
    body = dict(name="New SHG", sector="dairy", village="Arvi", block="Arvi")
    assert client.post("/enterprises", json={**body, **change}).status_code == 422


def test_flags_belong_to_the_named_enterprise(client):
    with db.connect() as con:
        flag = con.execute("SELECT id, enterprise_id FROM flags LIMIT 1").fetchone()
    eid = flag["enterprise_id"]
    body = dict(enterprise_id=eid, flag_id=flag["id"], officer_note="Visited the group")
    assert client.post("/interventions", json={**body, "enterprise_id": 1 if eid != 1 else 2}).status_code == 404
    assert client.post("/interventions", json=body).status_code == 200
    with db.connect() as con:
        assert con.execute("SELECT status FROM flags WHERE id=?", (flag["id"],)).fetchone()[0] == "open"
    assert client.post("/interventions", json={**body, "resolve": True}).status_code == 200
    with db.connect() as con:
        assert con.execute("SELECT status FROM flags WHERE id=?", (flag["id"],)).fetchone()[0] == "resolved"


def test_missing_suggestion_returns_not_found(client):
    assert client.post("/suggestions/999999/done").status_code == 404


def test_foreign_browser_writes_are_rejected(client):
    for path in ("/admin/reset", "/simulate/shock/feed_spike", "/transactions/batch"):
        assert client.post(path, headers={"Origin": "https://unrelated.example"}).status_code == 403
    assert client.post("/admin/reset", headers={"Sec-Fetch-Site": "cross-site"}).status_code == 403
    assert client.get("/districts", headers={"Host": "unrelated.example"}).status_code == 400
    assert client.post("/transactions/batch", json=[txn], headers={"Origin": "http://localhost:5173"}).status_code == 200
