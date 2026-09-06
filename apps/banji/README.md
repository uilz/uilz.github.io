# 伴记 · 运转账（任何会话从这一页接手）

本地私密的纸感日志 SPA：React 19 + TS strict + Vite + Vitest，IndexedDB 零网络，发布在
`/i/banji/`（GitHub Pages 直接 serve 仓内产物）。v1 契约冻结在 `docs/ARCHITECTURE.md`。
这一页只住运营纪律：环境/开发/测试/发布/文档地图/红线。

## 环境

- Node 24：`export PATH="$HOME/.local/node-current/bin:$PATH"`（下文一切命令以此为前提）
- 装包受阻时 `--registry=https://registry.npmmirror.com`
- 零依赖法：现有登记只有 react / react-dom / fflate / uuid /（dev）playwright-core 一族，
  新增依赖要先过 ROUNDS 的记账辩论。

## 开发

- `npm run dev`（base 是 `/i/banji/`，访问端口上的根路径 404 是常态，跟着打印路径走）。
- Service Worker 只在 PROD 构建注册（`src/ui/registerSw.ts`），dev 不抢壳。

## 测试（三道门 + 一终端判死）

1. `npx tsc --noEmit` —— 0 错。
2. `npx vitest run` —— 全绿（现 520 单测，jsdom 面 + node 面）。
3. `npm run build` —— 产物落在仓根 `i/banji/`。这是发布真相，**日常轮次不许 commit 它**，
   提交由 publish.sh 一手包办（见下）。
4. e2e 终端判死 —— `node e2e/live.mjs`（现 125 检，真 Chromium 真 IDB）：
   - 前置：先 `npm run build`（e2e 跑的是已构建产物，不是 dev server）；
   - 服务起在仓根（不是本目录）：`(cd ../.. && python3 -m http.server 4321 & echo $! > /tmp/bj-4321.pid)`；
     收场按 PID：`kill "$(cat /tmp/bj-4321.pid)"` —— 禁 pattern-kill 大水漫灌；
   - 目标默认 `http://127.0.0.1:4321/i/banji/`，`BJ_BASE` 可覆盖；
   - 浏览器复用 `~/.cache/ms-playwright` 的缓存 Chromium（playwright-core 按修订号自查，
     缺了才 `npx playwright install chromium`）；
   - 全绿口径：末行 `ALL CHECKS PASSED` 且 `CONSOLE ERRORS: 0`，**连跑两遍**才算过；
   - `e2e/*.banjizip`、`e2e/clip.png` 等夹具是现场生成的（e2e/.gitignore 忽略名单在册），
     永不入库也永不必手删。

## 发布

`apps/banji/publish.sh "<一句话>"` —— 三道门（tsc/vitest/build）任一失守即不发布；
分支非 main、或暂存区混入 i/banji 以外之物，即刻回绝；过后 `git add i/banji`、
提交 `chore(banji): publish <一句话>`、`git push origin main`，末行打印线上 curl 验尸单。
脚本住在 apps/banji/ 而 git 操作跑在仓根（i/banji 的户口在仓根）——它自己会 cd，无需你操心。
推送是真副作用：确认发布窗口再跑。

## 文档地图

| 文档 | 谁收这笔账 |
| --- | --- |
| `docs/ARCHITECTURE.md` | 契约（数据形状、唯一链、卡型与规格法） |
| `docs/ROUNDS.md` | 账本决策（逐轮完成 / 已死债 / R 债复述——下一轮做什么看这里） |
| `docs/REAL-DEVICE-CHECKLIST.md` | 人收的账（实机回执单，任何 ✗ 回仓就是下一轮工作账） |
| `e2e/README.md` | e2e 跑法小抄（本页测试节的浓缩版） |

## 红线

- 永不 force-push；`git add` 只点名 `apps/banji/**`，`i/banji/**` 归 publish.sh。
- 仓根 `index.html` 与 `i/shupai/` 是用户并行工作区，一字不碰。
- 纸面审美法：无红色错误态、无 toast 剧场；安静落笔走 `.bj-*-quiet` 淡墨血脉。
