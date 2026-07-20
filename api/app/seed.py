from __future__ import annotations

import argparse
import time
from contextlib import closing

from . import db
from .dataLayer import buildHistory
from .engine import runCascade
from .simulator import generate


def run(seed: int = 42, reset: bool = False) -> dict:
    t0 = time.time()
    if reset:
        db.resetDb()
    else:
        db.initDb()
    with closing(db.connect()) as con:
        count = con.execute("SELECT COUNT(*) FROM enterprises").fetchone()[0]
        if count:
            cascade = runCascade(con)
            return {**cascade, "note": "existing data kept; use --reset to replace it"}
    external = buildHistory(seed)
    sim = generate(external, seed)

    con = db.connect()
    for name, series in external.items():
        stype = "rainfall" if name == "rain" else "mandi_price"
        con.executemany(
            "INSERT INTO external_series(series_type, commodity, district, date,"
            " value, source) VALUES (?,?,?,?,?,?)",
            [(stype, name, "Wardha", p["date"], p["value"], p["source"])
             for p in series])
    con.executemany(
        "INSERT INTO enterprises(id, name, sector, village, block, district,"
        " members, started_at) VALUES (:id,:name,:sector,:village,:block,"
        ":district,:members,:started_at)", sim["enterprises"])
    con.executemany(
        "INSERT INTO transactions(enterprise_id, type, amount, note, entered_at,"
        " source) VALUES (:enterprise_id,:type,:amount,:note,:entered_at,:source)",
        sim["transactions"])
    con.executemany(
        "INSERT INTO loans(enterprise_id, principal, outstanding, emi, due_day,"
        " lender) VALUES (:enterprise_id,:principal,:outstanding,:emi,:due_day,"
        ":lender)", sim["loans"])
    con.commit()

    cascade = runCascade(con)
    con.close()
    return {"seconds": round(time.time() - t0, 1),
            "enterprises": len(sim["enterprises"]),
            "transactions": len(sim["transactions"]),
            "loans": len(sim["loans"]), **cascade}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create the local Sanket demo dataset.")
    parser.add_argument("--reset", action="store_true", help="delete saved entries and rebuild demo data")
    print(run(reset=parser.parse_args().reset))
