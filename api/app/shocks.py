from datetime import date, timedelta

from .engine import runCascade

shocks = {
    "feed_spike": dict(commodity="maize", days=42, ramp=0.26,
                       label="Feed-price spike (maize +26% over 6 weeks)"),
    "soy_spike": dict(commodity="soybean", days=42, ramp=0.22,
                      label="Raw-material spike (soybean +22%)"),
    "monsoon_deficit": dict(commodity="rain", days=45, cut=0.8,
                            label="Monsoon deficit (rainfall -80%, 45 days)"),
}


def inject(con, shockKey: str) -> dict:
    cfg = shocks[shockKey]
    last = con.execute("SELECT MAX(date) FROM external_series WHERE commodity=?", (cfg["commodity"],)).fetchone()[0]
    if not last:
        raise ValueError("seed the demo data before applying a shock")
    start = date.fromisoformat(last) - timedelta(days=cfg["days"] - 1)
    with con:
        rows = con.execute(
            "SELECT id, value FROM external_series WHERE commodity=? AND date>=? ORDER BY date",
            (cfg["commodity"], start.isoformat())).fetchall()
        for idx, row in enumerate(rows):
            factor = 1 + cfg["ramp"] * (idx + 1) / len(rows) if "ramp" in cfg else 1 - cfg["cut"]
            con.execute("UPDATE external_series SET value=?, source='synthetic_shock' WHERE id=?",
                        (round(row["value"] * factor, 1), row["id"]))
        result = runCascade(con)
    return {"shock": cfg["label"], **result}


def resetAndRecascade() -> dict:
    from . import seed
    return seed.run(reset=True)
