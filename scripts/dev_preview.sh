#!/usr/bin/env bash
# Sobe o AutoClip em modo local (preview):
#   - backend FastAPI em 127.0.0.1:8000 (SQLite, sem Redis)
#   - frontend Vite em 0.0.0.0:8080 (com proxy /api -> backend)
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export AUTOCLIP_DESKTOP_MODE=1
export AUTOCLIP_MODE=desktop
export AUTOCLIP_APP_DIR="${AUTOCLIP_APP_DIR:-$ROOT/data}"
export AUTOCLIP_DATA_DIR="$AUTOCLIP_APP_DIR"
export DATABASE_URL="${DATABASE_URL:-sqlite:///$ROOT/data/autoclip.db}"
export LOG_FILE="${LOG_FILE:-$ROOT/data/logs/backend.log}"
export PYTHONPATH="$ROOT:${PYTHONPATH:-}"
export PYTHONUNBUFFERED=1

mkdir -p data/logs data/uploads data/temp data/output data/projects

BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-8080}"

# banco (idempotente)
python3 init_database.py >> data/logs/init_db.log 2>&1 || \
  echo "[dev] aviso: init_database falhou, veja data/logs/init_db.log"

# backend
python3 -m uvicorn backend.app_factory:app --host 127.0.0.1 --port "$BACKEND_PORT" \
  >> data/logs/backend.stdout.log 2>&1 &
BACKEND_PID=$!

cleanup() { kill "$BACKEND_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

for _ in $(seq 1 40); do
  curl -sf -o /dev/null "http://127.0.0.1:$BACKEND_PORT/health" && break
  sleep 1
done

export BACKEND_URL="http://127.0.0.1:$BACKEND_PORT"
exec npm --prefix frontend run dev -- --host 0.0.0.0 --port "$FRONTEND_PORT"
