from __future__ import annotations

import json
from datetime import date

import numpy as np
import pandas as pd

from . import db

# sector -> which external drivers move its costs/income
exposure = {
    "maize_price": {"poultry": 0.65, "dairy": 0.35},     # feed cost share
    "soybean_price": {"food_processing": 0.5, "poultry": 0.2},
    "rain_deficit": {"dairy": 0.4, "rural_retail": 0.35, "food_processing": 0.2},
}

suggestionLib = {
    ("poultry", "feed_cost"): (
        "Feed prices are rising. Buy 3-4 weeks of feed now at current rates; consider smaller next batch.",
        "फ़ीड के दाम बढ़ रहे हैं। अभी 3-4 हफ़्ते का फ़ीड मौजूदा दाम पर खरीद लें; अगला बैच छोटा रखने पर विचार करें।"),
    ("dairy", "feed_cost"): (
        "Fodder costs may rise. Stock dry fodder early and increase weekly savings to cover the gap.",
        "चारे की लागत बढ़ सकती है। सूखा चारा पहले से जमा करें और साप्ताहिक बचत बढ़ाएँ।"),
    ("food_processing", "input_cost"): (
        "Raw material prices are up. Negotiate forward purchase with your FPO/mandi trader before procurement season.",
        "कच्चे माल के दाम बढ़े हैं। खरीद सीज़न से पहले FPO/व्यापारी से अग्रिम सौदे की बात करें।"),
    ("*", "rain_deficit"): (
        "Weak monsoon in your district may reduce local demand. Keep 6 weeks of expenses as cash buffer.",
        "कमज़ोर मानसून से स्थानीय माँग घट सकती है। 6 हफ़्ते के खर्च जितनी नकदी बचाकर रखें।"),
    ("*", "repayment_gap"): (
        "EMI payments have been missed. Meet your field officer this week to discuss restructuring before it affects your record.",
        "EMI छूटी है। रिकॉर्ड पर असर पड़ने से पहले इसी हफ़्ते फ़ील्ड अधिकारी से पुनर्गठन पर बात करें।"),
    ("*", "savings_decline"): (
        "Group savings have fallen. Restart even a small weekly amount - regularity matters more than size for your Saakh.",
        "समूह बचत घटी है। छोटी ही सही, साप्ताहिक बचत फिर शुरू करें - साख के लिए नियमितता सबसे ज़रूरी है।"),
    ("*", "forecast_shortfall"): (
        "Coming months look tight. Delay non-essential purchases and talk to your officer about a working-capital bridge.",
        "आने वाले महीने तंग दिख रहे हैं। ग़ैर-ज़रूरी खरीद टालें और वर्किंग-कैपिटल के लिए अधिकारी से बात करें।"),
}


def activeSignals(con) -> list[dict]:
    return [dict(row) for row in con.execute("SELECT * FROM signals WHERE active=1 ORDER BY id")]


def detectSignals(con, asOf: date | None = None) -> list[dict]:
    asOf = asOf or date.today()
    con.execute("UPDATE signals SET active=0")
    found = []
    for commodity in ("maize", "soybean", "rain"):
        rows = con.execute(
            "SELECT date, value FROM external_series WHERE commodity=? AND district='Wardha'"
            " AND date<=? ORDER BY date", (commodity, asOf.isoformat())).fetchall()
        frame = pd.DataFrame(rows, columns=["date", "value"])
        if len(frame) < 90:
            continue
        frame["date"] = pd.to_datetime(frame["date"])
        roll = frame.set_index("date")["value"].rolling("30D", min_periods=25).mean().dropna()
        lastDate = roll.index[-1]
        recent = float(roll.iloc[-1])
        if commodity == "rain":
            # compare rain with the same season in earlier years
            samples = []
            for year in sorted(set(roll.index.year)):
                if year >= lastDate.year:
                    continue
                center = lastDate - pd.DateOffset(years=lastDate.year - year)
                sample = roll.loc[center - pd.Timedelta(days=3):center + pd.Timedelta(days=3)]
                samples.extend(sample.tolist())
            if not samples or np.mean(samples) < 1:
                continue
            baseline = float(np.mean(samples))
            spread = max(float(np.std(samples)), baseline * 0.15, 0.5)
            z = (recent - baseline) / spread
            kind = ("rain_deficit" if recent < 0.65 * baseline and z <= -1.5 else
                    "rain_excess" if recent > 1.5 * baseline and z >= 2.2 else None)
            detail = f"30d rain mean {recent:.1f} mm vs same-season mean {baseline:.1f} mm"
        else:
            hist = roll.loc[lastDate - pd.Timedelta(days=395):lastDate - pd.Timedelta(days=30)]
            if len(hist) < 60:
                continue
            baseline = float(hist.mean())
            z = (recent - baseline) / max(float(hist.std()), 1)
            kind = "price_spike" if z >= 1.8 else "price_crash" if z <= -1.8 else None
            detail = f"30d price mean {recent:.1f} vs trailing-year mean {baseline:.1f}"
        if not kind:
            continue
        detectedAt = lastDate.date().isoformat()
        old = con.execute(
            "SELECT id FROM signals WHERE commodity=? AND kind=? AND detected_at=? ORDER BY id DESC LIMIT 1",
            (commodity, kind, detectedAt)).fetchone()
        if old:
            sid = old["id"]
            con.execute("UPDATE signals SET magnitude_z=?, detail=?, active=1 WHERE id=?",
                        (round(z, 2), detail, sid))
        else:
            sid = con.execute(
                "INSERT INTO signals(series_type, commodity, detected_at, kind, magnitude_z, window_days, detail)"
                " VALUES (?,?,?,?,?,?,?)",
                ("rainfall" if commodity == "rain" else "mandi_price", commodity,
                 detectedAt, kind, round(z, 2), 30, detail)).lastrowid
        found.append(dict(id=sid, commodity=commodity, kind=kind, magnitude_z=round(z, 2),
                          detected_at=detectedAt, detail=detail))
    return found


def monthlyNet(con, enterpriseId: int, asOf: date | None = None) -> pd.DataFrame:
    asOf = asOf or date.today()
    rows = con.execute(
        "SELECT entered_at, type, amount FROM transactions WHERE enterprise_id=?"
        " AND entered_at<=? ORDER BY entered_at", (enterpriseId, asOf.isoformat())).fetchall()
    columns = ["income", "expense", "savings", "loan_repayment"]
    if not rows:
        return pd.DataFrame(columns=["month", *columns, "net"])
    frame = pd.DataFrame(rows, columns=["date", "type", "amount"])
    frame["month"] = pd.to_datetime(frame["date"]).dt.to_period("M")
    grouped = frame.pivot_table(index="month", columns="type", values="amount", aggfunc="sum")
    months = pd.period_range(grouped.index.min(), grouped.index.max(), freq="M")
    grouped = grouped.reindex(index=months, columns=columns).fillna(0)
    grouped.index.name = "month"
    grouped["net"] = grouped["income"] - grouped["expense"] - grouped["loan_repayment"]
    return grouped.reset_index()


def forecastEnterprise(con, enterpriseId: int, sector: str,
                       signals: list[dict], horizon: int = 6, asOf: date | None = None) -> dict:
    asOf = asOf or date.today()
    currentMonth = pd.Period(asOf, freq="M")
    history = monthlyNet(con, enterpriseId, asOf)
    complete = history[history["month"] < currentMonth].set_index("month")
    modelTag = "seasonal_blend_v1"
    profile = complete
    peerNets = []
    if len(complete) < 13:
        peers = con.execute(
            "SELECT id FROM enterprises WHERE sector=? AND id!=? AND district="
            "(SELECT district FROM enterprises WHERE id=?)",
            (sector, enterpriseId, enterpriseId)).fetchall()
        profiles = []
        for peer in peers:
            frame = monthlyNet(con, peer["id"], asOf)
            frame = frame[frame["month"] < currentMonth].set_index("month")
            if len(frame) >= 13:
                profiles.append(frame)
                peerNets.extend((frame["net"].iloc[12:].to_numpy() - frame["net"].iloc[:-12].to_numpy()).tolist())
        if not profiles:
            con.execute("DELETE FROM forecasts WHERE enterprise_id=?", (enterpriseId,))
            return {}
        profile = pd.concat(profiles).groupby(level=0).median().sort_index()
        ratio = 1.0
        if len(complete) and complete["income"].mean() > 0:
            ratio = float(np.clip(complete["income"].mean() / max(profile["income"].mean(), 1), 0.3, 3))
        profile = profile * ratio
        peerNets = [value * ratio for value in peerNets]
        modelTag = "sector_prior_v1"

    months = [currentMonth + idx for idx in range(1, horizon + 1)]

    def project(series):
        recent = float(series.iloc[-3:].mean())
        past = float(series.iloc[-6:-3].mean())
        trend = float(np.clip((recent - past) / 3, -0.06 * recent, 0.06 * recent))
        return np.array([max(0, 0.55 * series.get(month - 12, recent) + 0.45 * recent + trend * idx * 0.5)
                         for idx, month in enumerate(months, 1)])

    income = project(profile["income"])
    expense = project(profile["expense"] + profile["loan_repayment"])
    adjustments = []
    for signal in signals:
        key = {"maize": "maize_price", "soybean": "soybean_price"}.get(signal["commodity"])
        if signal["kind"] == "price_spike" and key and sector in exposure[key]:
            bump = min(0.25, 0.06 * signal["magnitude_z"]) * exposure[key][sector]
            expense *= 1 + bump
            adjustments.append((signal, f"expenses +{bump * 100:.0f}%"))
        if signal["kind"] == "rain_deficit" and sector in exposure["rain_deficit"]:
            cut = min(0.2, 0.05 * abs(signal["magnitude_z"])) * exposure["rain_deficit"][sector]
            income *= 1 - cut
            adjustments.append((signal, f"income -{cut * 100:.0f}%"))

    nets = profile["net"].to_numpy()
    residuals = np.array(peerNets) if peerNets else nets[12:] - nets[:-12]
    spread = float(np.std(residuals, ddof=1)) / np.sqrt(2) if len(residuals) > 1 else float(np.std(nets))
    # a floor avoids zero-width ranges for short or flat histories
    spread = max(spread, float((profile["income"] + profile["expense"]).mean()) * 0.05, 1)
    points, band = [], []
    for idx, (month, inc, exp) in enumerate(zip(months, income, expense)):
        net = float(inc - exp)
        width = 1.28 * spread * np.sqrt(1 + idx * 0.15)
        points.append(dict(month=str(month), net=round(net), income=round(float(inc)), expense=round(float(exp))))
        band.append(dict(month=str(month), lo=round(net - width), hi=round(net + width)))
    con.execute("DELETE FROM forecasts WHERE enterprise_id=?", (enterpriseId,))
    con.execute(
        "INSERT INTO forecasts(enterprise_id, generated_at, horizon_months, points_json, band_json, model_tag)"
        " VALUES (?,?,?,?,?,?)",
        (enterpriseId, asOf.isoformat(), horizon, json.dumps(points), json.dumps(band),
         f"{modelTag}+{len(adjustments)}adj"))
    return {"points": points, "band": band, "adjustments": adjustments, "model_tag": modelTag}


def refreshEnterprise(con, enterprise: dict, signals: list[dict], asOf: date | None = None) -> dict:
    asOf = asOf or date.today()
    eid, sector = enterprise["id"], enterprise["sector"]
    forecast = forecastEnterprise(con, eid, sector, signals, asOf=asOf)
    reasons = []
    for signal, effect in forecast.get("adjustments", []):
        if signal["kind"] == "price_spike":
            reasons.append(dict(
                code="feed_cost" if sector in ("poultry", "dairy") else "input_cost",
                text_en=f"Shared demo {signal['commodity']} prices rose (z={signal['magnitude_z']}); projected {effect}",
                text_hi=f"साझा डेमो में {signal['commodity']} के दाम बढ़े (z={signal['magnitude_z']}); अनुमानित {effect}",
                evidence={"signal_id": signal["id"], "effect": effect}))
        else:
            reasons.append(dict(
                code="rain_deficit",
                text_en=f"Shared Wardha rainfall series shows a deficit (z={signal['magnitude_z']}); projected {effect}",
                text_hi=f"वर्धा की साझा वर्षा श्रृंखला में कमी (z={signal['magnitude_z']}); अनुमानित {effect}",
                evidence={"signal_id": signal["id"], "effect": effect}))

    history = monthlyNet(con, eid, asOf)
    complete = history[history["month"] < pd.Period(asOf, freq="M")].set_index("month")
    loan = con.execute("SELECT * FROM loans WHERE enterprise_id=?", (eid,)).fetchone()
    if loan:
        months = pd.period_range(end=pd.Period(asOf, freq="M") - 1, periods=3, freq="M")
        repayments = complete["loan_repayment"].reindex(months, fill_value=0)
        paid = int((repayments >= loan["emi"]).sum())
        if paid < 2:
            reasons.append(dict(
                code="repayment_gap", text_en=f"Full EMI recorded in only {paid} of the last 3 completed months",
                text_hi=f"पिछले 3 पूरे महीनों में केवल {paid} महीने पूरी EMI दर्ज हुई",
                evidence={"paid_months": paid, "emi": loan["emi"]}))
    if len(complete) >= 6:
        recent = float(complete["savings"].iloc[-3:].mean())
        past = float(complete["savings"].iloc[-6:-3].mean())
        if past > 0 and recent < 0.6 * past:
            reasons.append(dict(
                code="savings_decline", text_en=f"Group savings down {100 * (1 - recent / past):.0f}% vs previous quarter",
                text_hi=f"समूह बचत पिछली तिमाही से {100 * (1 - recent / past):.0f}% घटी",
                evidence={"recent": round(recent), "past": round(past)}))
    if forecast and loan:
        worst = min(point["net"] for point in forecast["points"][:3])
        if worst < 0:
            reasons.append(dict(
                code="forecast_shortfall", text_en=f"Forecast shows a monthly shortfall of ₹{abs(worst):,.0f} within 3 months",
                text_hi=f"पूर्वानुमान: 3 महीनों में ₹{abs(worst):,.0f} की मासिक कमी",
                evidence={"worst_net_3mo": worst}))

    old = con.execute("SELECT id FROM flags WHERE enterprise_id=? AND status='open' ORDER BY id DESC LIMIT 1", (eid,)).fetchone()
    if not reasons:
        if old:
            con.execute("UPDATE flags SET status='resolved' WHERE id=?", (old["id"],))
            con.execute("UPDATE suggestions SET active=0 WHERE flag_id=?", (old["id"],))
        return forecast
    severity = len(reasons) + int(any(reason["code"] == "repayment_gap" for reason in reasons))
    level = "alert" if severity >= 4 else "warning" if severity >= 2 else "watch"
    signalId = next((r["evidence"]["signal_id"] for r in reasons if "signal_id" in r["evidence"]), None)
    if old:
        fid = old["id"]
        con.execute("UPDATE flags SET level=?, signal_id=? WHERE id=?", (level, signalId, fid))
        db.writeReasons(con, fid, reasons)
    else:
        fid = db.createFlag(con, eid, level, asOf.isoformat(), reasons, signalId)
    con.execute("UPDATE suggestions SET active=0 WHERE flag_id=?", (fid,))
    for reason in reasons:
        suggestion = suggestionLib.get((sector, reason["code"])) or suggestionLib.get(("*", reason["code"]))
        if not suggestion:
            continue
        oldSuggestion = con.execute("SELECT id FROM suggestions WHERE flag_id=? AND text_en=?", (fid, suggestion[0])).fetchone()
        if oldSuggestion:
            con.execute("UPDATE suggestions SET active=1 WHERE id=?", (oldSuggestion["id"],))
        else:
            con.execute("INSERT INTO suggestions(flag_id, text_en, text_hi) VALUES (?,?,?)", (fid, *suggestion))
    return forecast


def runCascade(con, asOf: date | None = None) -> dict:
    asOf = asOf or date.today()
    with con:
        signals = detectSignals(con, asOf)
        enterprises = con.execute("SELECT * FROM enterprises").fetchall()
        for enterprise in enterprises:
            refreshEnterprise(con, enterprise, signals, asOf)
    byLevel = {r["level"]: r["n"] for r in con.execute("SELECT level, COUNT(*) n FROM flags WHERE status='open' GROUP BY level")}
    bySector = {r["sector"]: r["n"] for r in con.execute(
        "SELECT e.sector, COUNT(DISTINCT f.enterprise_id) n FROM flags f JOIN enterprises e"
        " ON e.id=f.enterprise_id WHERE f.status='open' GROUP BY e.sector")}
    return {"signals": signals, "enterprises": len(enterprises), "flagged": sum(byLevel.values()),
            "by_level": byLevel, "by_sector": bySector}
