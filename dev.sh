#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")" && pwd)"
pythonPath="$root/api/.venv/bin/python"

if [[ ! -x "$pythonPath" || ! -d "$root/app/node_modules" ]]; then
    echo "Install the API and app dependencies first. See README.md."
    exit 1
fi

(cd "$root/api" && "$pythonPath" -m app.seed)

apiPid=''
appPid=''
cleanup() {
    [[ -z "$apiPid" ]] || kill "$apiPid" 2>/dev/null || true
    [[ -z "$appPid" ]] || kill "$appPid" 2>/dev/null || true
    wait || true
}
trap cleanup EXIT
trap 'exit 130' INT TERM

echo "Starting API at http://127.0.0.1:8000 and app at http://127.0.0.1:5173"
(cd "$root/api" && exec "$pythonPath" -m uvicorn app.main:app --host 127.0.0.1 --port 8000) &
apiPid=$!
(cd "$root/app" && exec node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort) &
appPid=$!
wait -n "$apiPid" "$appPid"
