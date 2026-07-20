"""Shock injection - the demo's time machine.

Appends a synthetic-but-realistic perturbation to the REAL-calibrated
external series, then re-runs the same nightly cascade the system always
runs. Nothing downstream is faked: flags appear because the causal pipeline
found them.
"""
from __future__ import annotations

from datetime import timedelta

from . import db
from .data_layer import END_DATE
from .engine import run_cascade

SHOCKS = {
    # 6-week ramp to +26% on maize: the Vidarbha poultry-crisis scenario
    "feed_spike": dict(commodity="maize", days=42, ramp=0.26,
                       label="Feed-price spike (maize +26% over 6 weeks)"),
    "soy_spike": dict(commodity="soybean", days=42, ramp=0.22,
                      label="Raw-material spike (soybean +22%)"),
    # kill 80% of rainfall for the trailing 45 days
    "monsoon_deficit": dict(commodity="rain", days=45, cut=0.8,
                            label="Monsoon deficit (rainfall -80%, 45 days)"),
}


def inject(con, shock_key: str) -> dict:
    cfg = SHOCKS[shock_key]
    start = END_DATE - timedelta(days=cfg["days"])
    rows = con.execute(
        "SELECT id, date, value FROM external_series WHERE commodity=? AND date>=?"
        " ORDER BY date", (cfg["commodity"], start.isoformat())).fetchall()
    for i, r in enumerate(rows):
        frac = (i + 1) / len(rows)
        if "ramp" in cfg:
            new = r["value"] * (1 + cfg["ramp"] * frac)
        else:
            new = r["value"] * (1 - cfg["cut"])
        con.execute("UPDATE external_series SET value=?, source='synthetic_shock'"
                    " WHERE id=?", (round(new, 1), r["id"]))
    con.commit()
    result = run_cascade(con)
    return {"shock": cfg["label"], **result}


def reset_and_recascade() -> dict:
    """Full pristine reset: rebuild external series + simulation + cascade."""
    from . import seed
    return seed.run(reset=True)
