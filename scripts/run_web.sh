#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="${BUILD_DIR:-$ROOT/backend-build}"
DB_PATH="${DB_PATH:-$HOME/intellibot_ws/data/intellibot.db}"
cmake -S "$ROOT/backend" -B "$BUILD_DIR"
cmake --build "$BUILD_DIR" -j 4
exec "$BUILD_DIR/intellibot_backend" --port "${PORT:-8080}" --web-root "$ROOT/frontend" --db-path "$DB_PATH" --ai-url "${AI_URL:-http://127.0.0.1:8091}"
