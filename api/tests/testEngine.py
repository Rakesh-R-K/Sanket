from datetime import date

import pandas as pd

from app import db
from app.dataLayer import buildHistory
from app.engine import activeSignals, detectSignals, forecastEnterprise, runCascade


def test_cascade_keeps_notes_and_completed_actions(client):
    row = next(r for r in client.get("/enterprises").json() if r["risk"] != "healthy")
    profile = client.get(f"/enterprises/{row['id']}").json()
    flag = profile["flags"][0]
    sid = flag["suggestions"][0]["id"]
    assert client.post(f"/suggestions/{sid}/done").status_code == 200
    assert client.post("/interventions", json=dict(
        enterprise_id=row["id"], flag_id=flag["id"], officer_note="Visited the group")).status_code == 200
    assert client.post("/simulate/shock/feed_spike").status_code == 200
    with db.connect() as con:
        assert not con.execute("PRAGMA foreign_key_check").fetchall()
        assert con.execute("SELECT officer_note FROM interventions WHERE flag_id=?", (flag["id"],)).fetchone()[0] == "Visited the group"
        assert con.execute("SELECT action_status FROM suggestions WHERE id=?", (sid,)).fetchone()[0] == "done"
    profile = client.get(f"/enterprises/{row['id']}").json()
    assert any(action["id"] == sid for action in profile["action_history"])


def test_repeated_cascade_keeps_open_flags(client):
    with db.connect() as con:
        before = [tuple(row) for row in con.execute("SELECT id, enterprise_id FROM flags WHERE status='open' ORDER BY id")]
        runCascade(con)
        after = [tuple(row) for row in con.execute("SELECT id, enterprise_id FROM flags WHERE status='open' ORDER BY id")]
        assert after == before
        assert con.execute("SELECT COUNT(*) FROM forecasts").fetchone()[0] == 168


def test_today_is_visible_and_backdated_entry_updates_forecast(client):
    month = pd.Period(date.today(), freq="M")
    before = client.get("/enterprises/1").json()
    income = next((p["income"] for p in before["history"] if p["month"] == str(month)), 0)
    assert client.post("/transactions/batch", json=[dict(
        enterprise_id=1, type="income", amount=875, entered_at=date.today().isoformat())]).status_code == 200
    after = client.get("/enterprises/1").json()
    assert after["history"][-1]["month"] == str(month)
    assert after["history"][-1]["income"] == income + 875
    assert after["forecast"]["points"][0]["month"] == str(month + 1)
    # a partial current month should not be treated as a full training month
    assert after["forecast"]["points"] == before["forecast"]["points"]
    assert client.post("/transactions/batch", json=[dict(
        enterprise_id=1, type="income", amount=100000, entered_at=str(month - 1) + "-15")]).status_code == 200
    assert client.get("/enterprises/1").json()["forecast"]["points"] != before["forecast"]["points"]


def test_peer_forecast_has_range_and_uses_the_same_district(client):
    res = client.post("/enterprises", json=dict(name="New dairy", sector="dairy", village="Arvi", block="Arvi"))
    eid = res.json()["id"]
    profile = client.get(f"/enterprises/{eid}").json()
    assert all(p["hi"] > p["lo"] for p in profile["forecast"]["band"])
    with db.connect() as con:
        con.execute("UPDATE transactions SET amount=amount*1000 WHERE enterprise_id IN"
                    " (SELECT id FROM enterprises WHERE district='Nagpur')")
        forecast = forecastEnterprise(con, eid, "dairy", activeSignals(con))
    assert forecast["points"] == profile["forecast"]["points"]


def test_monsoon_deficit_uses_a_seasonal_baseline(client):
    asOf = date(2026, 7, 1)
    rain = buildHistory(asOf=asOf)["rain"]
    with db.connect() as con:
        con.execute("DELETE FROM external_series WHERE commodity='rain'")
        con.executemany(
            "INSERT INTO external_series(series_type, commodity, district, date, value, source)"
            " VALUES ('rainfall', 'rain', 'Wardha', ?, ?, ?)",
            [(p["date"], p["value"], p["source"]) for p in rain])
        con.execute("UPDATE external_series SET value=value*0.2 WHERE commodity='rain' AND date>='2026-05-18'")
        signals = detectSignals(con, asOf)
    assert any(s["kind"] == "rain_deficit" for s in signals)
