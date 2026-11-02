#!/usr/bin/env bash
# 从 AtomGit 拉官方 Q1 模型（MJCF + STL）到 sim/assets/q1-urdf。
# 仓库约 35 MB，其中 meshes 25 MB，所以不进 git，按需拉。
# 下面的地址是 Q1 模型上游仓库（第三方），与本项目名无关，不能改成 IntelliBot。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/sim/assets/q1-urdf"

if [ -f "$DEST/xml/q1_v3_mc.xml" ]; then
  echo "== 模型已存在：$DEST/xml/q1_v3_mc.xml"
  exit 0
fi

mkdir -p "$(dirname "$DEST")"
echo "== 克隆 https://atomgit.com/primebot/q1-urdf.git"
git clone --depth 1 https://atomgit.com/primebot/q1-urdf.git "$DEST"
echo "== 完成：$DEST/xml/q1_v3_mc.xml"
