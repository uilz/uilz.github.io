# 伴记真浏览器 E2E
node e2e/live.mjs 跑已构建的 i/banji/ 产物（仓根起 `python3 -m http.server 4321`）；可用 BJ_BASE 覆盖目标地址。
浏览器复用缓存的 Playwright Chromium：PLAYWRIGHT_BROWSERS_PATH=~/.cache/ms-playwright（playwright-core 按修订号自动查找，缺则 `npx playwright install chromium`）。
