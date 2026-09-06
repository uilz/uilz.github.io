// 伴记主屏图标作坊（R14）—— 一张安静的宣纸方块 + 「伴」字发丝题签，无 emoji、无渐变。
// 跑法：node scripts/make-icons.mjs（用 devDep playwright-core 的无头 Chromium 落墨，
// 与真浏览器同一套字体栈：Noto Serif CJK SC 在 fc-list 可查得）。
// 输出 apps/banji/public/icons/*.png，作为源文件入库，经 Vite public 直通发布。
// 每次跑字节级可复现（确定性画序，无随机源）。
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '..', 'public', 'icons')
mkdirSync(OUT, { recursive: true })

// —— 令牌镜像：唯一出处是 src/ui/styles/base.css（--bj-paper/--bj-ink-soft/--bj-hairline/--bj-fiber）；
//    此处为作坊侧手抄（页面函数被序列化，闭包不可用），改令牌须同步。 ——

// PAGE_FN 在页面里画：S=边长，border=发丝内框（maskable 裁圆会切掉它，故关），glyph=「伴」占幅比例。
const PAGE_FN = ({ S, border, glyph }) => {
  const cv = document.createElement('canvas')
  cv.width = S
  cv.height = S
  const g = cv.getContext('2d')
  g.fillStyle = '#f2ecdf'
  g.fillRect(0, 0, S, S)
  // 纸纤维：横向淡丝，疏而不匀（黄金角步进给出确定性的“不匀”）
  g.strokeStyle = 'rgba(120, 95, 60, 0.05)'
  g.lineWidth = Math.max(1, S / 256)
  for (let i = 0; i < 26; i++) {
    const y = ((i * 0.6180339887 + 0.11) % 1) * S
    const x0 = ((i * 0.3819660113 + 0.07) % 0.66) * S
    g.beginPath()
    g.moveTo(x0, y)
    g.quadraticCurveTo(x0 + S * 0.2, y + ((i % 5) - 2) * 2, x0 + S * (0.34 + (i % 3) * 0.05), y)
    g.stroke()
  }
  if (border) {
    // 发丝内框（四周留白 5.5%）
    const m = S * 0.055
    g.strokeStyle = 'rgba(126, 102, 68, 0.34)'
    g.lineWidth = Math.max(1, S / 384)
    g.strokeRect(m, m, S - 2 * m, S - 2 * m)
  }
  // 「伴」题签：宋体大字，光学校正 CJK 基线（middle 略偏低，上移 4%）
  g.fillStyle = 'rgba(111, 98, 80, 0.92)'
  g.font = `${Math.round(S * glyph)}px "Noto Serif CJK SC", "Songti SC", serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('伴', S / 2, S / 2 + S * 0.02)
  return cv.toDataURL('image/png')
}

const browser = await chromium.launch()
const page = await browser.newPage()
const specs = [
  { name: 'icon-192.png', S: 192, border: true, glyph: 0.5 },
  { name: 'icon-512.png', S: 512, border: true, glyph: 0.5 },
  { name: 'icon-maskable-512.png', S: 512, border: false, glyph: 0.38 },
  { name: 'apple-touch-icon.png', S: 180, border: false, glyph: 0.46 },
]
for (const s of specs) {
  const dataUrl = await page.evaluate(PAGE_FN, s)
  writeFileSync(join(OUT, s.name), Buffer.from(dataUrl.split(',')[1], 'base64'))
  console.log('wrote', s.name, s.S + 'x' + s.S)
}
await browser.close()
