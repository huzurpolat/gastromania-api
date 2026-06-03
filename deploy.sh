#!/bin/bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/mnt/downloads_pool/apps/gastromania}"
API_HOST_PORT="${API_HOST_PORT:-${HOST_PORT:-3003}}"
FRONTEND_HOST_PORT="${FRONTEND_HOST_PORT:-8083}"
CLIENT_MAX_BODY_SIZE="${CLIENT_MAX_BODY_SIZE:-25m}"
LOG_MAX_SIZE="${LOG_MAX_SIZE:-10m}"
LOG_MAX_FILE="${LOG_MAX_FILE:-5}"

cd "$APP_ROOT"

if [ ! -f "$APP_ROOT/gastromania-api/.env" ]; then
  echo "ENV-Datei fehlt: $APP_ROOT/gastromania-api/.env"
  echo "Bitte gastromania-api/.env aus .env.example erstellen und produktive Werte setzen."
  exit 1
fi

pull_repo() {
  local repo_path="$1"
  if [ -d "$repo_path/.git" ]; then
    git -C "$repo_path" pull
  else
    echo "Git-Repository nicht gefunden, Pull uebersprungen: $repo_path"
  fi
}

echo "=== Pull Gastromania Repositories ==="
pull_repo "$APP_ROOT/gastromania"

pull_repo "$APP_ROOT/gastromania-api"

mkdir -p "$APP_ROOT/uploads"

echo "=== Build und Start Gastromania API via Docker Compose ==="
export API_HOST_PORT FRONTEND_HOST_PORT CLIENT_MAX_BODY_SIZE LOG_MAX_SIZE LOG_MAX_FILE
docker compose up -d --build gastromania-api

if command -v curl >/dev/null 2>&1; then
  echo "=== Smoke Check API ==="
  curl -fsS "http://127.0.0.1:${API_HOST_PORT}/api/health" >/dev/null
fi

echo "=== API Deployment fertig: http://localhost:${API_HOST_PORT}/api/health ==="
