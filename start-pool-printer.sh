#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_LOG="${PROJECT_ROOT}/data/app.log"
MIDDLEWARE_LOG="${PROJECT_ROOT}/data/print-middleware.log"

mkdir -p "${PROJECT_ROOT}/data"

cd "${PROJECT_ROOT}"

echo "[start] starting Next.js app..."
nohup npm run start >"${APP_LOG}" 2>&1 &
APP_PID=$!

echo "[start] starting print middleware..."
nohup npx tsx print-middleware/index.ts >"${MIDDLEWARE_LOG}" 2>&1 &
MIDDLEWARE_PID=$!

echo "[ok] app pid=${APP_PID}"
echo "[ok] middleware pid=${MIDDLEWARE_PID}"
echo "[logs] ${APP_LOG}"
echo "[logs] ${MIDDLEWARE_LOG}"
