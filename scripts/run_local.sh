#!/usr/bin/env bash
# 只启动本地后端。AI 服务未启动时，账号、页面和动作演示仍可使用。
#   PORT=8081 bash scripts/run_local.sh
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
if [ -n "${WSL_DISTRO_NAME:-}" ] || grep -qi microsoft /proc/version 2>/dev/null; then
  echo "检测到 WSL。请在 Windows PowerShell 中运行：python run.py" >&2
  exit 2
fi

# 依次找：环境变量 > 仓库内构建目录
if [ -n "${INTELLIBOT_BIN:-}" ]; then
  bin="$INTELLIBOT_BIN"
elif [ -x "$project_dir/backend-build/intellibot_backend" ]; then
  bin="$project_dir/backend-build/intellibot_backend"
elif [ -x "$project_dir/backend-build/intellibot_backend.exe" ]; then
  bin="$project_dir/backend-build/intellibot_backend.exe"
else
  echo "找不到 intellibot_backend，先运行：python run.py --bootstrap-only" >&2
  exit 2
fi

exec "$bin" --port "${PORT:-8080}" --web-root "$project_dir/frontend"
