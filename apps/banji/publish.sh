#!/usr/bin/env bash
# publish.sh — 伴记发布（R1-R14 手工仪式的一字誊写：门不过即不发，发必只发 i/banji）
#
# 用法:
#   apps/banji/publish.sh "round-15 收口"        # 提交为 chore(banji): publish round-15 收口
#
# 户口说明: 本脚本住在 apps/banji/，但 git 动作全部跑在**仓根**——i/banji/ 的构建产物
# 是 Pages 的 serve 本体，它的户口本在仓根。脚本自动定位两处，调用方无需 cd。
# 三道门: npx tsc --noEmit · npx vitest run · npm run build（任一失守，发布中止）。
# 护栏: 分支非 main 拒发；暂存区若含 i/banji 以外之物拒发（用户在别处的并行工程是常态，
# 未 stage 的工作区脏不算脏，已 stage 的一律视为要混进发布的货）。绝不 force-push。

set -euo pipefail

SCRIPT="$(readlink -f "$0" 2>/dev/null || echo "$0")"
APP_DIR="$(dirname "$SCRIPT")"
REPO_ROOT="$(git -C "$APP_DIR" rev-parse --show-toplevel)"

if [ $# -lt 1 ] || [ -z "${1:-}" ]; then
  echo "用法: $0 <发布一句话>  （提交信息 = chore(banji): publish <一句话>）"
  exit 1
fi
MSG="$1"

if ! command -v node >/dev/null 2>&1; then
  echo "错误: 找不到 node —— 先执行 export PATH=\"\$HOME/.local/node-current/bin:\$PATH\"（见 apps/banji/README.md）"
  exit 1
fi

echo "── 门一 tsc ──"
(cd "$APP_DIR" && npx tsc --noEmit)
echo "── 门二 vitest ──"
(cd "$APP_DIR" && npx vitest run)
echo "── 门三 build（产物直写仓根 i/banji/）──"
(cd "$APP_DIR" && npm run build)

cd "$REPO_ROOT"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$BRANCH" != "main" ]; then
  echo "错误: 当前分支是 $BRANCH，发布只认 main"
  exit 1
fi

if ! git diff --cached --quiet -- . ':(exclude)i/banji'; then
  echo "错误: 暂存区含 i/banji 以外的内容（下列文件），拒绝混发——先 git restore --staged 它们："
  git diff --cached --name-only -- . ':(exclude)i/banji'
  exit 1
fi

git add i/banji
if git diff --cached --quiet; then
  echo "跳过: i/banji 与仓内一字不差，无货可发"
  exit 0
fi

git commit -m "chore(banji): publish $MSG"
git push origin main

echo "已发布。线上验尸（Pages 部署需 ~1 分钟，稍后逐条跑）:"
echo "  curl -sI https://uilz.github.io/i/banji/ | head -1"
echo "  curl -s  https://uilz.github.io/i/banji/ | grep -o 'assets/index-[A-Za-z0-9_-]*\\.js' | head -1"
echo "  curl -sI https://uilz.github.io/i/banji/manifest.json | head -1"
echo "  curl -s  https://uilz.github.io/i/banji/sw.js | head -c 80; echo"
