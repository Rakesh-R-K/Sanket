from __future__ import annotations

import json
from contextlib import asynccontextmanager, closing
from datetime import date, datetime
from typing import Annotated, Literal

from fastapi import Body, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from . import db
from .engine import activeSignals, monthlyNet, refreshEnterprise
from .shocks import shocks, inject, resetAndRecascade

@asynccontextmanager
async def lifespan(app):
    db.initDb()
    yield


app = FastAPI(title="Sanket API", version="0.1.0", lifespan=lifespan)
allowedOrigins = {f"http://{host}:{port}" for host in ("localhost", "127.0.0.1")
                  for port in (5173, 4173, 8000)}
app.add_middleware(CORSMiddleware, allow_origins=sorted(allowedOrigins),
                   allow_methods=["GET", "POST"], allow_headers=["Content-Type"])
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["localhost", "127.0.0.1"])


@app.middleware("http")
async def guardWrites(req: Request, callNext):
    if req.method not in ("GET", "HEAD", "OPTIONS"):
        origin = req.headers.get("origin")
        if (origin is not None and origin not in allowedOrigins) or req.headers.get("sec-fetch-site") == "cross-site":
            return JSONResponse({"detail": "writes are only allowed from the local app"}, status_code=403)
    return await callNext(req)

levelRank = {"alert": 0, "warning": 1, "watch": 2, None: 3}


class Input(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid", allow_inf_nan=False)


class TxnIn(Input):
    enterpriseId: int = Field(alias="enterprise_id", gt=0)
    type: Literal["income", "expense", "savings", "loan_repayment"]
    amount: float = Field(gt=0, le=100_000_000, multiple_of=0.01)
    note: str = Field(default="", max_length=500)
    enteredAt: date = Field(alias="entered_at")
    source: Literal["manual"] = "manual"

    @field_validator("enteredAt")
    @classmethod
    def checkDate(cls, value):
        if not date(2000, 1, 1) <= value <= date.today():
            raise ValueError("date must be between 2000-01-01 and today")
        return value


class EnterpriseIn(Input):
    name: str = Field(min_length=1, max_length=120)
    sector: Literal["dairy", "poultry", "food_processing", "handicrafts", "rural_retail"]
    village: str = Field(min_length=1, max_length=80)
    block: str = Field(min_length=1, max_length=80)
    district: Literal["Wardha", "Nagpur", "Amravati", "Yavatmal"] = "Wardha"
    members: int = Field(default=1, ge=1, le=500)


class InterventionIn(Input):
    enterpriseId: int = Field(alias="enterprise_id", gt=0)
    flagId: int | None = Field(default=None, alias="flag_id", gt=0)
    officerNote: str = Field(alias="officer_note", min_length=1, max_length=2000)
    outcome: str = Field(default="", max_length=1000)
    resolve: bool = False

    @model_validator(mode="after")
    def checkResolution(self):
        if self.resolve and not self.flagId:
            raise ValueError("choose a flag to resolve")
        return self


def requireEnterprise(con, eid):
    if not con.execute("SELECT 1 FROM enterprises WHERE id=?", (eid,)).fetchone():
        raise HTTPException(404, "enterprise not found")


def flagsWithReasons(con, enterpriseId: int) -> list[dict]:
    flags = []
    for f in con.execute(
            "SELECT * FROM flags WHERE enterprise_id=? AND status='open'"
            " ORDER BY opened_at DESC", (enterpriseId,)):
        reasons = [dict(r) for r in con.execute(
            "SELECT code, text_en, text_hi, evidence_json FROM flag_reasons"
            " WHERE flag_id=?", (f["id"],))]
        suggestions = [dict(s) for s in con.execute(
            "SELECT id, text_en, text_hi, action_status FROM suggestions"
            " WHERE flag_id=? AND active=1", (f["id"],))]
        flags.append({**dict(f), "reasons": reasons, "suggestions": suggestions})
    return flags


@app.get("/districts")
def listDistricts():
    con = db.connect()
    out = []
    for d in con.execute("SELECT DISTINCT district FROM enterprises ORDER BY district"):
        row = con.execute("""
            SELECT COUNT(*) total,
              SUM(CASE WHEN EXISTS (SELECT 1 FROM flags f WHERE
                  f.enterprise_id=e.id AND f.status='open' AND f.level='alert')
                  THEN 1 ELSE 0 END) alerts,
              SUM(CASE WHEN EXISTS (SELECT 1 FROM flags f WHERE
                  f.enterprise_id=e.id AND f.status='open' AND
                  f.level IN ('warning','watch')) THEN 1 ELSE 0 END) flagged
            FROM enterprises e WHERE e.district=?""", (d["district"],)).fetchone()
        out.append({"district": d["district"], **dict(row)})
    con.close()
    return out


@app.post("/enterprises", status_code=201)
def createEnterprise(e: EnterpriseIn):
    with closing(db.connect()) as con, con:
        cur = con.execute(
            "INSERT INTO enterprises(name, sector, village, block, district,"
            " members, started_at) VALUES (?,?,?,?,?,?,?)",
            (e.name, e.sector, e.village, e.block, e.district, e.members,
             date.today().isoformat()))
        eid = cur.lastrowid
        fc = refreshEnterprise(con, {"id": eid, "sector": e.sector}, activeSignals(con))
    return {"id": eid, "forecast_model": fc.get("model_tag") if fc else None}


@app.get("/enterprises")
def listEnterprises(district: str = "Wardha"):
    con = db.connect()
    rows = [dict(e) for e in con.execute(
        "SELECT * FROM enterprises WHERE district=?", (district,))]
    for e in rows:
        f = con.execute(
            "SELECT id, level, opened_at FROM flags WHERE enterprise_id=? AND"
            " status='open' ORDER BY CASE level WHEN 'alert' THEN 0 WHEN"
            " 'warning' THEN 1 ELSE 2 END LIMIT 1", (e["id"],)).fetchone()
        e["risk"] = f["level"] if f else "healthy"
        e["reason_count"] = con.execute(
            "SELECT COUNT(*) c FROM flag_reasons fr JOIN flags fl ON"
            " fl.id=fr.flag_id WHERE fl.enterprise_id=? AND fl.status='open'",
            (e["id"],)).fetchone()["c"]
        top = con.execute(
            "SELECT fr.text_en, fr.text_hi FROM flag_reasons fr JOIN flags fl"
            " ON fl.id=fr.flag_id WHERE fl.enterprise_id=? AND fl.status='open'"
            " LIMIT 1", (e["id"],)).fetchone()
        e["top_reason"] = dict(top) if top else None
    con.close()
    rows.sort(key=lambda e: (levelRank.get(e["risk"], 3), -e["reason_count"]))
    return rows


@app.get("/enterprises/{eid}")
def enterpriseProfile(eid: int):
    con = db.connect()
    e = con.execute("SELECT * FROM enterprises WHERE id=?", (eid,)).fetchone()
    if not e:
        con.close()
        raise HTTPException(404)
    g = monthlyNet(con, eid)
    history = [dict(month=str(r["month"]), income=float(r["income"]),
                    expense=float(r["expense"]),
                    savings=float(r["savings"]),
                    repayment=float(r["loan_repayment"]),
                    net=float(r["net"])) for _, r in g.iterrows()]
    fc = con.execute(
        "SELECT points_json, band_json, model_tag, generated_at FROM forecasts"
        " WHERE enterprise_id=? ORDER BY id DESC LIMIT 1", (eid,)).fetchone()
    loan = con.execute("SELECT * FROM loans WHERE enterprise_id=?", (eid,)).fetchone()
    txns = [dict(t) for t in con.execute(
        "SELECT type, amount, note, entered_at, source FROM transactions"
        " WHERE enterprise_id=? ORDER BY entered_at DESC LIMIT 30", (eid,))]
    result = {
        **dict(e), "history": history[-24:],
        "forecast": (dict(points=json.loads(fc["points_json"]),
                          band=json.loads(fc["band_json"]),
                          model_tag=fc["model_tag"],
                          generated_at=fc["generated_at"]) if fc else None),
        "loan": dict(loan) if loan else None,
        "flags": flagsWithReasons(con, eid),
        "recent_transactions": txns,
        "interventions": [dict(i) for i in con.execute(
            "SELECT * FROM interventions WHERE enterprise_id=? ORDER BY"
            " logged_at DESC", (eid,))],
        "action_history": [dict(s) for s in con.execute(
            "SELECT s.id, s.text_en, s.text_hi, s.action_status, f.opened_at FROM suggestions s"
            " JOIN flags f ON f.id=s.flag_id WHERE f.enterprise_id=? AND s.action_status!='suggested'"
            " ORDER BY s.id DESC", (eid,))],
    }
    con.close()
    return result


@app.get("/risk/district/{district}")
def districtRisk(district: str):
    con = db.connect()
    blocks: dict[str, dict] = {}
    for r in con.execute("""
        SELECT e.block, e.sector,
               COALESCE((SELECT level FROM flags f WHERE f.enterprise_id=e.id
                         AND f.status='open' ORDER BY CASE level
                         WHEN 'alert' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END
                         LIMIT 1), 'healthy') risk
        FROM enterprises e WHERE e.district=?""", (district,)):
        b = blocks.setdefault(r["block"], {"levels": {}, "sectors": {}})
        b["levels"][r["risk"]] = b["levels"].get(r["risk"], 0) + 1
        b["sectors"].setdefault(r["sector"], {})
        b["sectors"][r["sector"]][r["risk"]] = \
            b["sectors"][r["sector"]].get(r["risk"], 0) + 1
    signals = [dict(s) for s in con.execute(
        "SELECT * FROM signals WHERE active=1 ORDER BY id DESC LIMIT 10")]
    kpis = con.execute("""
        SELECT COUNT(*) total,
          SUM(CASE WHEN EXISTS (SELECT 1 FROM flags f WHERE
              f.enterprise_id=e.id AND f.status='open' AND f.level='alert')
              THEN 1 ELSE 0 END) alerts,
          SUM(CASE WHEN EXISTS (SELECT 1 FROM flags f WHERE
              f.enterprise_id=e.id AND f.status='open' AND f.level='warning')
              THEN 1 ELSE 0 END) warnings
        FROM enterprises e WHERE e.district=?""", (district,)).fetchone()

    # Cluster bulletins: the district-level story a DDM or bank regional
    # office consumes. Auto-composed from signals x sector exposure x flags.
    from .engine import exposure
    signalSectors = {"maize": "maize_price", "soybean": "soybean_price"}
    bulletins = []
    for s in signals:
        if s["kind"] not in ("price_spike", "rain_deficit"):
            continue
        key = ("rain_deficit" if s["kind"] in ("rain_deficit", "rain_excess")
               else signalSectors.get(s["commodity"]))
        exposed = exposure.get(key, {}) if key else {}
        for sector, share in sorted(exposed.items(), key=lambda kv: -kv[1]):
            row = con.execute("""
                SELECT COUNT(DISTINCT e.id) n,
                  SUM(CASE WHEN f.level IN ('alert','warning') THEN 1 ELSE 0 END) hot
                FROM enterprises e LEFT JOIN flags f
                  ON f.enterprise_id=e.id AND f.status='open'
                WHERE e.district=? AND e.sector=?""", (district, sector)).fetchone()
            if not row["n"]:
                continue
            driver = ("monsoon deficit" if key == "rain_deficit"
                      else f"{s['commodity']} price {'spike' if 'spike' in s['kind'] else 'shift'}")
            bulletins.append({
                "sector": sector, "driver": driver, "z": s["magnitude_z"],
                "exposed_units": row["n"], "stressed_units": row["hot"] or 0,
                "text": (f"{sector.replace('_', ' ').title()} cluster, {district}: "
                         f"{driver} (z={s['magnitude_z']}). {row['n']} units exposed "
                         f"(~{int(share*100)}% cost/income sensitivity), "
                         f"{row['hot'] or 0} showing combined stress. Recommended: "
                         + ("advance input purchase advisories; review EMI schedules of stressed units."
                            if key != "rain_deficit" else
                            "cash-buffer advisories; monitor demand-linked enterprises.")),
            })
    con.close()
    return {"district": district, "blocks": blocks, "signals": signals,
            "kpis": dict(kpis), "bulletins": bulletins}


@app.post("/transactions/batch")
def addTransactions(txns: Annotated[list[TxnIn], Body(min_length=1, max_length=100)]):
    with closing(db.connect()) as con, con:
        for eid in {t.enterpriseId for t in txns}:
            requireEnterprise(con, eid)
        con.executemany(
            "INSERT INTO transactions(enterprise_id, type, amount, note,"
            " entered_at, source) VALUES (?,?,?,?,?,?)",
            [(t.enterpriseId, t.type, t.amount, t.note, t.enteredAt.isoformat(), "manual")
             for t in txns])
        signals = activeSignals(con)
        for eid in {t.enterpriseId for t in txns}:
            enterprise = con.execute("SELECT id, sector FROM enterprises WHERE id=?", (eid,)).fetchone()
            refreshEnterprise(con, enterprise, signals)
    return {"synced": len(txns)}


@app.post("/interventions")
def logIntervention(iv: InterventionIn):
    with closing(db.connect()) as con, con:
        requireEnterprise(con, iv.enterpriseId)
        if iv.flagId and not con.execute(
                "SELECT 1 FROM flags WHERE id=? AND enterprise_id=?",
                (iv.flagId, iv.enterpriseId)).fetchone():
            raise HTTPException(404, "flag not found for this enterprise")
        con.execute(
            "INSERT INTO interventions(enterprise_id, flag_id, officer_note,"
            " logged_at, outcome) VALUES (?,?,?,?,?)",
            (iv.enterpriseId, iv.flagId, iv.officerNote,
             datetime.now().isoformat(timespec="seconds"), iv.outcome))
        if iv.resolve:
            con.execute("UPDATE flags SET status='resolved' WHERE id=?", (iv.flagId,))
    return {"ok": True}


@app.post("/suggestions/{sid}/done")
def suggestionDone(sid: int):
    with closing(db.connect()) as con, con:
        cur = con.execute("UPDATE suggestions SET action_status='done' WHERE id=?", (sid,))
        if not cur.rowcount:
            raise HTTPException(404, "suggestion not found")
    return {"ok": True}


@app.post("/simulate/shock/{shockKey}")
def simulateShock(shockKey: str):
    if shockKey not in shocks:
        raise HTTPException(400, f"unknown shock; options: {list(shocks)}")
    with closing(db.connect()) as con:
        try:
            result = inject(con, shockKey)
        except ValueError as err:
            raise HTTPException(409, str(err)) from err
    return result


@app.post("/admin/reset")
def adminReset():
    return resetAndRecascade()


@app.get("/validation/leadtime")
def validationLeadtime():
    con = db.connect()
    leadDays: list[int] = []
    detail = []
    for f in con.execute("""
        SELECT f.id, f.enterprise_id, f.opened_at, e.name FROM flags f
        JOIN enterprises e ON e.id=f.enterprise_id WHERE f.status='open'"""):
        fc = con.execute(
            "SELECT points_json FROM forecasts WHERE enterprise_id=?"
            " ORDER BY id DESC LIMIT 1", (f["enterprise_id"],)).fetchone()
        if not fc:
            continue
        points = json.loads(fc["points_json"])
        neg = next((p for p in points if p["net"] < 0), None)
        if not neg:
            continue
        opened = datetime.fromisoformat(f["opened_at"])
        distress = datetime.fromisoformat(neg["month"] + "-15")  # mid-month
        days = (distress - opened).days
        if days > 0:
            leadDays.append(days)
            detail.append({"enterprise": f["name"], "flagged": f["opened_at"],
                           "projected_distress_month": neg["month"],
                           "lead_days": days})
    con.close()
    leadDays.sort()
    n = len(leadDays)
    return {
        "flags_with_projected_distress": n,
        "median_lead_days": leadDays[n // 2] if n else None,
        "min_lead_days": leadDays[0] if n else None,
        "max_lead_days": leadDays[-1] if n else None,
        "target_days": 45,
        "interpretation": "Derived from the forecast, not a measured prediction accuracy.",
        "detail": sorted(detail, key=lambda d: d["lead_days"])[:10],
    }


@app.get("/saakh/{eid}")
def saakhPayload(eid: int):
    profile = enterpriseProfile(eid)
    con = db.connect()
    txnStats = con.execute("""
        SELECT COUNT(*) entries,
               MIN(entered_at) first_entry,
               COUNT(DISTINCT substr(entered_at,1,7)) active_months
        FROM transactions WHERE enterprise_id=?""", (eid,)).fetchone()
    resolved = con.execute(
        "SELECT COUNT(*) c FROM flags WHERE enterprise_id=? AND"
        " status='resolved'", (eid,)).fetchone()["c"]
    con.close()
    hist = [p for p in profile["history"] if p["month"] < date.today().strftime("%Y-%m")]
    savMonths = sum(1 for m in hist if m["savings"] > 0)
    repMonths = sum(1 for m in hist if m["repayment"] > 0)
    return {
        **profile,
        "discipline": {
            **dict(txnStats),
            "window_months": len(hist),
            "savings_regularity_pct": round(100 * savMonths / max(1, len(hist))),
            "repayment_regularity_pct": round(100 * repMonths / max(1, len(hist))),
            "shocks_survived": resolved,
        },
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "disclaimer_en": ("Demo data mixed with manual entries. Market and rainfall context uses a shared "
                          "Wardha series, mostly generated from seasonal assumptions. Forecast ranges "
                          "are indicative and have no measured coverage. This report is not a credit score."),
    }
