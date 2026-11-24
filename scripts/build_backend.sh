#!/usr/bin/env bash
# Compatibility wrapper. Project setup is now handled by run.py.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ -n "${WSL_DISTRO_NAME:-}" ] || grep -qi microsoft /proc/version 2>/dev/null; then
  echo "检测到 WSL。请在 Windows PowerShell 中运行：python run.py --bootstrap-only" >&2
  exit 2
fi

cd "$ROOT"
exec python run.py --bootstrap-only
