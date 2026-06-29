#!/usr/bin/env bash
# publish-md.sh — 将 .md 文件渲染为 HTML 发布到 GitHub Pages /md/
#
# 用法:
#   ./publish-md.sh path/to/article.md              # 自动命名
#   ./publish-md.sh path/to/article.md "自定义标题"   # 指定文章标题
#
# 该脚本与 render-md.py 配合，产出含 KaTeX 公式的完整 HTML 页面，
# 提交到 GitHub Pages 仓库的 md/ 目录，手机/电脑均可直接浏览器阅读。

set -euo pipefail

# 解析 symlink 到真实路径
SCRIPT="$(readlink -f "$0" 2>/dev/null || echo "$0")"
REPO_DIR="$(cd "$(dirname "$SCRIPT")" && pwd)"
RENDER_SCRIPT="/home/deploy/edu-companion/render-md.py"
MD_DIR="$REPO_DIR/md"
INDEX_FILE="$MD_DIR/index.html"

if [ $# -lt 1 ]; then
  echo "用法: $0 <input.md> [文章标题]"
  exit 1
fi

INPUT_MD="$(realpath "$1")"
if [ ! -f "$INPUT_MD" ]; then
  echo "错误: 文件不存在 — $INPUT_MD"
  exit 1
fi

BASENAME="$(basename "$INPUT_MD" .md)"
TITLE="${2:-$BASENAME}"
OUTPUT_HTML="$MD_DIR/$BASENAME.html"

echo "📖  源文件: $INPUT_MD"
echo "📄  目标:   $OUTPUT_HTML"
echo "🏷️  标题:   $TITLE"

# ── 1) Pandoc → HTML ──
echo "🔨 Pandoc → HTML ..."
HTML_CONTENT=$(cd /home/deploy/edu-companion && python3 -c "
import importlib.util, sys
spec = importlib.util.spec_from_file_location('render_md', '$RENDER_SCRIPT')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

with open('$INPUT_MD', 'r', encoding='utf-8') as f:
    md = f.read()
html = mod.build_full_html(md)
print(html)
")

# ── 2) 写入 .html ──
echo "$HTML_CONTENT" > "$OUTPUT_HTML"
echo "✅ HTML 已写入: $OUTPUT_HTML ($(wc -c < "$OUTPUT_HTML") 字节)"

# ── 3) 更新 index.html 文章列表 ──
# 用 Python 解析 index.html，在 <ul id="article-list"> 中插入新条目
python3 -c "
import re
from datetime import date

index_path = '$INDEX_FILE'
new_title = '$TITLE'
html_file = '$BASENAME.html'
today = date.today().isoformat()

with open(index_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 检查是否已存在同名文章
if html_file in content:
    print('⏭️  文章已在列表中，跳过 index 更新')
else:
    # 在 <ul id=\"article-list\"> 的 <!-- publish-md.sh --> 注释后插入
    new_entry = f'      <li><a class=\"article\" href=\"{html_file}\"><span class=\"title\">{new_title}</span><span class=\"date\">{today}</span></a></li>\n    '
    # 在第一个 <li> 前插入（保持时间倒序，最新的在最上面）
    insert_pos = content.find('<!-- publish-md.sh 会在此插入文章列表 -->')
    if insert_pos == -1:
        # fallback: 在 <ul> 内首行插入
        ul_marker = '<ul id=\"article-list\">'
        insert_pos = content.find(ul_marker) + len(ul_marker) + 1
        content = content[:insert_pos] + '\n    ' + new_entry + content[insert_pos:]
    else:
        marker_end = insert_pos + len('<!-- publish-md.sh 会在此插入文章列表 -->')
        # 在注释之后插入，然后在注释标记前加个空行
        # 更好的做法：替换注释为新条目 + 注释
        old_marker = '<!-- publish-md.sh 会在此插入文章列表 -->'
        new_marker = old_marker + '\n' + new_entry
        content = content.replace(old_marker, new_marker, 1)

    with open(index_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print('✅ index.html 已更新')
"

# ── 4) Commit & Push ──
cd "$REPO_DIR"
# 确保 remote 是 SSH 协议（HTTPS clone 不会缓存凭证）
CURRENT_REMOTE="$(git remote get-url origin)"
if [[ "$CURRENT_REMOTE" != git@* ]]; then
  git remote set-url origin git@github.com:uilz/uilz.github.io.git
fi

git add md/"$BASENAME.html" md/index.html
if git diff --cached --quiet; then
  echo "⏭️  无变更，跳过提交"
else
  git commit -m "publish: $TITLE"
  echo "🚀 推送至 GitHub Pages ..."
  git push origin main
  echo "✅ 已发布: https://uilz.github.io/md/$BASENAME.html"
fi
