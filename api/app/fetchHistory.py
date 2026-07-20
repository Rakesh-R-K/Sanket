from __future__ import annotations

import json
import os
import time
import urllib.parse
import urllib.request

from .dataLayer import rawDir

key = os.environ.get(
    "DATAGOV_KEY", "579b464db66ec23bdd000001cdd3946e44ce4aad7209ff7b23ac571b")
resource = "35985678-0d79-46b4-9ed6-6f13308a1d24"
baseUrl = f"https://api.data.gov.in/resource/{resource}"


def getPage(params: dict, tries: int = 5) -> dict:
    url = baseUrl + "?" + urllib.parse.urlencode(params)
    delay = 2.0
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                return json.load(r)
        except Exception:
            time.sleep(delay)
            delay = min(delay * 2, 30)
    return {}


def fetchCommodity(commodity: str, state: str = "Maharashtra",
                    page: int = 100, maxRecords: int = 4000) -> int:
    outPath = rawDir / f"history_{commodity.lower()}.json"
    records: list[dict] = []
    seen: set[tuple] = set()
    if outPath.exists():                       # resume
        records = json.loads(outPath.read_text())
        seen = {(r["Arrival_Date"], r["Market"], r.get("Variety")) for r in records}

    offset = len(records)
    stall = 0
    while len(records) < maxRecords and stall < 3:
        d = getPage({"api-key": key, "format": "json", "limit": page,
                  "offset": offset, "filters[commodity]": commodity,
                  "filters[state]": state})
        recs = d.get("records", [])
        if not recs:
            stall += 1
            time.sleep(3)
            continue
        new = [r for r in recs
               if (r["Arrival_Date"], r["Market"], r.get("Variety")) not in seen]
        for r in new:
            seen.add((r["Arrival_Date"], r["Market"], r.get("Variety")))
        records.extend(new)
        offset += len(recs)
        stall = 0 if new else stall + 1
        rawDir.mkdir(parents=True, exist_ok=True)
        outPath.write_text(json.dumps(records))
        print(f"{commodity}: {len(records)} records (total avail {d.get('total')})",
              flush=True)
        time.sleep(1.2)                          # be polite to the throttler
    return len(records)


if __name__ == "__main__":
    for c in ("Maize", "Soyabean"):
        n = fetchCommodity(c)
        print(f"DONE {c}: {n} real records saved")
