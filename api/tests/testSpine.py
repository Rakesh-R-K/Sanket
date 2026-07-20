from app import db
from app.shocks import inject


def test_seed_is_deterministic_and_complete(client):
    con = db.connect()
    assert con.execute("SELECT COUNT(*) c FROM enterprises").fetchone()["c"] == 168
    sectors = {r["sector"] for r in con.execute("SELECT DISTINCT sector FROM enterprises")}
    assert sectors == {"dairy", "poultry", "food_processing", "handicrafts",
                       "rural_retail"}
    assert con.execute("SELECT COUNT(*) c FROM transactions").fetchone()["c"] > 30000
    con.close()


def test_every_flag_has_reasons(client):
    con = db.connect()
    orphans = con.execute("""
        SELECT COUNT(*) c FROM flags f WHERE NOT EXISTS
        (SELECT 1 FROM flag_reasons r WHERE r.flag_id=f.id)""").fetchone()["c"]
    con.close()
    assert orphans == 0, "explainability contract violated"


def test_triage_list_ranked(client):
    rows = client.get("/enterprises").json()
    assert len(rows) >= 40  # default district (Wardha)
    ranks = {"alert": 0, "warning": 1, "watch": 2, "healthy": 3}
    order = [ranks[r["risk"]] for r in rows]
    assert order == sorted(order)


def test_profile_has_forecast_with_band(client):
    rows = client.get("/enterprises").json()
    p = client.get(f"/enterprises/{rows[0]['id']}").json()
    assert p["forecast"] and len(p["forecast"]["points"]) == 6
    assert all(b["lo"] <= b["hi"] for b in p["forecast"]["band"])
    assert len(p["history"]) >= 20


def test_shock_cascade_flags_exposed_sectors(client):
    con = db.connect()
    result = inject(con, "feed_spike")
    assert any(s["kind"] == "price_spike" for s in result["signals"])
    poultry_flagged = con.execute("""
        SELECT COUNT(DISTINCT f.enterprise_id) c FROM flags f
        JOIN enterprises e ON e.id=f.enterprise_id
        WHERE e.sector='poultry' AND f.status='open'""").fetchone()["c"]
    con.close()
    assert poultry_flagged >= 5, "feed spike must cascade to poultry cluster"


def test_saakh_payload_complete(client):
    rows = client.get("/enterprises").json()
    s = client.get(f"/saakh/{rows[0]['id']}").json()
    for key in ("discipline", "history", "forecast", "disclaimer_en"):
        assert key in s
    assert 0 <= s["discipline"]["savings_regularity_pct"] <= 100


def test_offline_sync_batch(client):
    r = client.post("/transactions/batch", json=[dict(
        enterprise_id=1, type="income", amount=2500,
        note="milk payment", entered_at="2026-07-18", source="manual")])
    assert r.json()["synced"] == 1


def test_cold_start_enterprise_gets_sector_prior_forecast(client):
    r = client.post("/enterprises", json=dict(
        name="Navjeevan SHG (Radha)", sector="dairy",
        village="Talegaon", block="Arvi", members=11))
    assert r.status_code == 201
    body = r.json()
    assert body["forecast_model"] and body["forecast_model"].startswith("sector_prior")
    p = client.get(f"/enterprises/{body['id']}").json()
    assert p["forecast"] and len(p["forecast"]["points"]) == 6
    assert p["forecast"]["model_tag"].startswith("sector_prior")


def test_reset_restores_pristine_state(client):
    r = client.post("/admin/reset").json()
    assert r["enterprises"] == 168 and r["seconds"] < 60
