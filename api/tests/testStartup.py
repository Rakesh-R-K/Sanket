from app import db, seed


def test_startup_keeps_saved_entries(client):
    with db.connect() as con:
        con.execute("INSERT INTO transactions(enterprise_id, type, amount, entered_at, source)"
                    " VALUES (1, 'income', 875, '2026-07-18', 'manual')")
        count = con.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]
    res = seed.run()
    with db.connect() as con:
        assert con.execute("SELECT COUNT(*) FROM transactions").fetchone()[0] == count
    assert res["enterprises"] == 168
