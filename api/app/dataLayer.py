from __future__ import annotations

import json
import math
from datetime import date, timedelta
from pathlib import Path

import numpy as np

rawDir = Path(__file__).resolve().parent.parent.parent / "data" / "raw"
priceAnchors = {"maize": 2100.0, "soybean": 4400.0}
# approximate monthly rainfall for Wardha, in mm
rainClimatology = [8, 5, 12, 8, 15, 170, 300, 250, 160, 45, 12, 6]


def loadRealHistory(commodity: str) -> dict[str, float]:
    path = rawDir / f"history_{commodity.lower()}.json"
    if not path.exists():
        return {}
    try:
        records = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return {}
    from collections import defaultdict
    byDay: dict[str, list[float]] = defaultdict(list)
    for r in records:
        try:
            d = r["Arrival_Date"]                      # DD/MM/YYYY
            iso = date(int(d[6:10]), int(d[3:5]), int(d[0:2])).isoformat()
            price = float(r["Modal_Price"])
            if math.isfinite(price) and price > 0:
                byDay[iso].append(price)
        except (KeyError, ValueError, TypeError):
            continue
    return {d: float(np.median(v)) for d, v in byDay.items()}


def buildHistory(seed: int = 42, asOf: date | None = None) -> dict[str, list[dict]]:
    rng = np.random.default_rng(seed)
    asOf = asOf or date.today()
    start = date(asOf.year - 2, asOf.month, 1)
    days = (asOf - start).days + 1
    dates = [start + timedelta(days=i) for i in range(days)]
    out: dict[str, list[dict]] = {}

    def ar1(n: int, sigma: float, phi: float = 0.85) -> np.ndarray:
        e = rng.normal(0, sigma, n)
        x = np.zeros(n)
        for i in range(1, n):
            x[i] = phi * x[i - 1] + e[i]
        return x

    commodityFiles = {"maize": "maize", "soybean": "soyabean"}  # API spelling
    for commodity, anchor in priceAnchors.items():
        real = loadRealHistory(commodityFiles[commodity])
        if real:  # re-anchor the structural model to the real median level
            anchor = float(np.median(list(real.values())))
        seasonalAmp = 0.07 if commodity == "maize" else 0.09
        noise = ar1(days, sigma=anchor * 0.006)
        series = []
        for i, d in enumerate(dates):
            iso = d.isoformat()
            if iso in real:
                series.append({"date": iso, "value": round(real[iso], 1),
                               "source": "agmarknet_real"})
                continue
            doy = d.timetuple().tm_yday
            seasonal = -seasonalAmp * math.cos(2 * math.pi * (doy - 300) / 365)
            drift = 0.04 * (i / 365)
            v = anchor * (1 + seasonal + drift) + noise[i]
            series.append({"date": iso, "value": round(v, 1),
                           "source": "agmarknet_calibrated"})
        out[commodity] = series

    # Rainfall: daily draws whose monthly totals track climatology; year 2
    # gets a mild built-in deficit in Jun-Jul (a realistic weak-monsoon year,
    # gives the risk engine something honest to find even pre-shock).
    rain = []
    for d in dates:
        monthly = rainClimatology[d.month - 1]
        deficit = 0.75 if (d.year == asOf.year and d.month in (6, 7)) else 1.0
        lam = monthly * deficit / 30.0
        wet = rng.random() < min(0.9, lam / 4 + 0.08)
        amount = rng.gamma(2.0, lam / 1.5) if wet and lam > 0 else 0.0
        rain.append({"date": d.isoformat(), "value": round(float(amount), 1),
                     "source": "imd_calibrated"})
    out["rain"] = rain

    return out
