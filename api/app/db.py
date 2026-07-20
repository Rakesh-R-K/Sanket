import json
import os
import sqlite3
from pathlib import Path

dbPath = Path(os.environ.get("SANKET_DB", Path(__file__).resolve().parent.parent / "sanket.db"))

schema = """
CREATE TABLE IF NOT EXISTS enterprises (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    sector TEXT NOT NULL CHECK(sector IN
        ('dairy','poultry','food_processing','handicrafts','rural_retail')),
    village TEXT NOT NULL,
    block TEXT NOT NULL,
    district TEXT NOT NULL DEFAULT 'Wardha',
    members INTEGER NOT NULL DEFAULT 1,
    started_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY,
    enterprise_id INTEGER NOT NULL REFERENCES enterprises(id),
    type TEXT NOT NULL CHECK(type IN ('income','expense','savings','loan_repayment')),
    amount REAL NOT NULL,
    note TEXT DEFAULT '',
    entered_at TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'simulated'
);
CREATE TABLE IF NOT EXISTS loans (
    id INTEGER PRIMARY KEY,
    enterprise_id INTEGER NOT NULL REFERENCES enterprises(id),
    principal REAL NOT NULL,
    outstanding REAL NOT NULL,
    emi REAL NOT NULL,
    due_day INTEGER NOT NULL DEFAULT 5,
    lender TEXT NOT NULL DEFAULT 'Gramin Bank'
);
CREATE TABLE IF NOT EXISTS external_series (
    id INTEGER PRIMARY KEY,
    series_type TEXT NOT NULL CHECK(series_type IN ('mandi_price','rainfall')),
    commodity TEXT NOT NULL,          -- e.g. 'maize','soybean' or 'rain'
    district TEXT NOT NULL DEFAULT 'Wardha',
    date TEXT NOT NULL,
    value REAL NOT NULL,
    source TEXT NOT NULL              -- 'agmarknet','imd','synthetic_shock'
);
CREATE TABLE IF NOT EXISTS signals (
    id INTEGER PRIMARY KEY,
    series_type TEXT NOT NULL,
    commodity TEXT NOT NULL,
    detected_at TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('price_spike','price_crash','rain_deficit','rain_excess')),
    magnitude_z REAL NOT NULL,
    window_days INTEGER NOT NULL,
    detail TEXT DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS forecasts (
    id INTEGER PRIMARY KEY,
    enterprise_id INTEGER NOT NULL REFERENCES enterprises(id),
    generated_at TEXT NOT NULL,
    horizon_months INTEGER NOT NULL DEFAULT 6,
    points_json TEXT NOT NULL,        -- [{month, net, income, expense}]
    band_json TEXT NOT NULL,          -- [{month, lo, hi}]
    model_tag TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS flags (
    id INTEGER PRIMARY KEY,
    enterprise_id INTEGER NOT NULL REFERENCES enterprises(id),
    level TEXT NOT NULL CHECK(level IN ('watch','warning','alert')),
    opened_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','escalated')),
    signal_id INTEGER REFERENCES signals(id)
);
CREATE TABLE IF NOT EXISTS flag_reasons (
    id INTEGER PRIMARY KEY,
    flag_id INTEGER NOT NULL REFERENCES flags(id),
    code TEXT NOT NULL,
    text_en TEXT NOT NULL,
    text_hi TEXT NOT NULL,
    evidence_json TEXT DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS suggestions (
    id INTEGER PRIMARY KEY,
    flag_id INTEGER NOT NULL REFERENCES flags(id),
    text_en TEXT NOT NULL,
    text_hi TEXT NOT NULL,
    action_status TEXT NOT NULL DEFAULT 'suggested'
        CHECK(action_status IN ('suggested','done','dismissed')),
    active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS interventions (
    id INTEGER PRIMARY KEY,
    enterprise_id INTEGER NOT NULL REFERENCES enterprises(id),
    flag_id INTEGER REFERENCES flags(id),
    officer_note TEXT NOT NULL,
    logged_at TEXT NOT NULL,
    outcome TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_txn_ent ON transactions(enterprise_id, entered_at);
CREATE INDEX IF NOT EXISTS idx_series ON external_series(series_type, commodity, date);
CREATE INDEX IF NOT EXISTS idx_flags_ent ON flags(enterprise_id, status);
"""


def connect() -> sqlite3.Connection:
    dbPath.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(dbPath, timeout=15)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    return con


def initDb(con: sqlite3.Connection | None = None) -> None:
    own = con is None
    con = con or connect()
    con.executescript(schema)
    for table in ("signals", "suggestions"):
        columns = {r["name"] for r in con.execute(f"PRAGMA table_info({table})")}
        if "active" not in columns:
            con.execute(f"ALTER TABLE {table} ADD COLUMN active INTEGER NOT NULL DEFAULT 1")
    con.commit()
    if own:
        con.close()


def resetDb() -> None:
    if dbPath.exists():
        dbPath.unlink()
    initDb()


def createFlag(con, enterpriseId: int, level: str, openedAt: str,
               reasons: list[dict], signalId: int | None = None) -> int:
    if not reasons:
        raise ValueError("flag requires >=1 reason (explainability contract)")
    cur = con.execute(
        "INSERT INTO flags(enterprise_id, level, opened_at, signal_id) VALUES (?,?,?,?)",
        (enterpriseId, level, openedAt, signalId))
    fid = cur.lastrowid
    writeReasons(con, fid, reasons)
    return fid


def writeReasons(con, fid: int, reasons: list[dict]) -> None:
    con.execute("DELETE FROM flag_reasons WHERE flag_id=?", (fid,))
    for r in reasons:
        con.execute(
            "INSERT INTO flag_reasons(flag_id, code, text_en, text_hi, evidence_json)"
            " VALUES (?,?,?,?,?)",
            (fid, r["code"], r["text_en"], r["text_hi"],
             json.dumps(r.get("evidence", {}))))
