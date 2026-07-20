# Sanket

A local cash-flow and risk review app for rural micro enterprises, built for a
NABARD hackathon. React and TypeScript handle the two views; FastAPI and SQLite
store entries, forecasts and officer notes.

## Run locally

Use Python 3.12+ and Node 20.19 or 22.12+. Tested with Python 3.13 and Node 20.19.
From the repo root:

```bash
python3 -m venv api/.venv
api/.venv/bin/python -m pip install --upgrade pip==26.2
api/.venv/bin/python -m pip install -r api/requirements.txt
npm ci --prefix app
./dev.sh
```

Open <http://127.0.0.1:5173>. API docs are at <http://127.0.0.1:8000/docs>.
The first run seeds 168 enterprises across four districts. Later starts keep
saved data. Ctrl+C stops both servers. On Windows, use `python` instead of
`python3`, `api\.venv\Scripts\python.exe` for pip, then `.\dev.ps1`.
The PowerShell runner was syntax checked; it still needs a native Windows run.

Alternatively, `docker compose up --build` serves the same URLs and keeps SQLite
in a named volume. No accounts are included: this is an unauthenticated local
demo, bound to localhost. Use sample records, not personal financial data.

## What works

- Register and select an enterprise, record income, expenses, savings or EMI.
- Save entries offline, see pending/failed entries and retry without duplicates.
- Filter officer triage by district, block, name/village, sector and risk.
- Inspect forecasts and bilingual reasons, log visits, complete suggestions
  and print a SAAKH cash-flow report.

For offline use, first build the app and run the preview while the API is up:
`npm run build --prefix app`, then `npm run preview --prefix app -- --host 127.0.0.1`.
Open <http://127.0.0.1:4173> online once and visit the enterprise you need.
The service worker caches visited records; Dexie queues writes with UUIDs and
the API acknowledges them before the app marks them synced.

## How it works

The forecast blends last year's matching month with recent completed months
and a capped trend. New enterprises use peers from the same district and sector.
Price and seasonal rainfall deviations feed sector exposure rules, which adjust
forecasts and create flags with reasons. Recalculation keeps visit and action
history. Scenario buttons change the shared series across all demo districts.

Financial records and rainfall are generated. Prices use generated history unless
you fetch public records: export `DATAGOV_KEY` using `api/.env.example` as a guide,
then run `cd api` and `.venv/bin/python -m app.fetchHistory`. A fresh seed reads
these files. Set `SANKET_DB` to a separate database when trying this with saved work.
The app does not load `.env` files automatically. Forecast ranges have no measured
coverage, and projected lead time is not measured accuracy. SAAKH is a record,
not a credit score.

## Checks

```bash
(cd api && .venv/bin/python -m pytest -q)
npm run lint --prefix app
npm run build --prefix app
```

Tests use temporary databases. To deliberately erase demo records, use the
confirmed reset in the officer view, or run `cd api` then
`.venv/bin/python -m app.seed --reset`. Sync pending browser entries first.
