#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v node >/dev/null 2>&1; then
  for node_bin in /opt/homebrew/Cellar/node@20/*/bin; do
    if [[ -x "$node_bin/node" ]]; then
      export PATH="$node_bin:$PATH"
      break
    fi
  done
fi

if ! command -v node >/dev/null 2>&1 || [[ ! -x "$project_root/.venv/bin/uvicorn" ]]; then
  echo "Install the Python and Node dependencies described in README.md first." >&2
  exit 1
fi

export DATABASE_URL="sqlite:///$project_root/backend/finreg.db"
export PYTHONPATH="$project_root/backend"

(cd "$project_root/backend" && "$project_root/.venv/bin/alembic" upgrade head)

(cd "$project_root/backend" && exec "$project_root/.venv/bin/uvicorn" finreg.main:app --host 127.0.0.1 --port 8000) &
api_pid=$!
(cd "$project_root/web" && exec npm run dev -- -H 127.0.0.1) &
web_pid=$!

trap 'kill "$api_pid" "$web_pid" 2>/dev/null || true' EXIT INT TERM
echo "Open http://127.0.0.1:3000"
wait "$api_pid" "$web_pid"
