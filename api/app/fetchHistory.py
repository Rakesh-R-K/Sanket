from __future__ import annotations

import json
import os
import time
import urllib.parse
import urllib.request

from .dataLayer import rawDir

resource = "35985678-0d79-46b4-9ed6-6f13308a1d24"
baseUrl = f"https://api.data.gov.in/resource/{resource}"


def getPage(params: dict, tries: int = 3) -> dict:
    url = baseUrl + "?" + urllib.parse.urlencode(params)
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=30) as res:
                data = json.load(res)
            if not isinstance(data, dict) or not isinstance(data.get("records"), list):
                raise RuntimeError("Market API returned no records list. Check DATAGOV_KEY.")
            return data
        except (OSError, json.JSONDecodeError):
            if attempt + 1 < tries:
                time.sleep(2 ** attempt)
    raise RuntimeError("Market data request failed. Check DATAGOV_KEY and connectivity.")


def fetchCommodity(commodity: str, state: str = "Maharashtra",
                    page: int = 100, maxRecords: int = 4000) -> int:
    key = os.environ.get("DATAGOV_KEY", "").strip()
    if not key:
        raise RuntimeError("Set DATAGOV_KEY to your data.gov.in API key before fetching history.")
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
            break
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
    if not records:
        raise RuntimeError(f"No {commodity} records returned; existing demo data was kept.")
    return len(records)


if __name__ == "__main__":
    try:
        for commodity in ("Maize", "Soyabean"):
            count = fetchCommodity(commodity)
            print(f"{commodity}: {count} records saved")
    except RuntimeError as err:
        raise SystemExit(str(err)) from None
