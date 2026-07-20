from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

from app import db


def entry():
    return dict(client_id=str(uuid4()), enterprise_id=1, type="income", amount=875,
                note="milk payment", entered_at="2026-07-18")


def test_concurrent_retries_create_one_entry(client):
    txn = entry()
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: client.post("/transactions/batch", json=[txn]), range(2)))
    assert all(res.status_code == 200 for res in responses)
    assert sum(res.json()["inserted"] for res in responses) == 1
    assert all(res.json()["accepted_ids"] == [txn["client_id"]] for res in responses)
    with db.connect() as con:
        row = con.execute("SELECT COUNT(*), SUM(amount) FROM transactions WHERE client_id=?", (txn["client_id"],)).fetchone()
        assert tuple(row) == (1, 875)


def test_same_values_with_different_ids_are_separate_entries(client):
    rows = [entry(), entry()]
    res = client.post("/transactions/batch", json=rows)
    assert res.status_code == 200 and res.json()["inserted"] == 2


def test_conflicting_retry_rolls_back_the_whole_batch(client):
    txn = entry()
    assert client.post("/transactions/batch", json=[txn]).status_code == 200
    other = entry()
    assert client.post("/transactions/batch", json=[other, {**txn, "amount": 999}]).status_code == 409
    with db.connect() as con:
        assert not con.execute("SELECT 1 FROM transactions WHERE client_id=?", (other["client_id"],)).fetchone()
        assert con.execute("SELECT amount FROM transactions WHERE client_id=?", (txn["client_id"],)).fetchone()[0] == 875
