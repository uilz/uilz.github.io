// 伴记真浏览器 E2E（非 vitest 闸；R1 的 /tmp/banji-e2e/hero.mjs 固化进仓 + R2 附件闭环扩展）。
// 跑法见 e2e/README.md。所有断言都吃“观察到的结果”，不测内部实现。
import { chromium } from 'playwright-core'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BJ_BASE ?? 'http://127.0.0.1:4321/i/banji/'
const HERE = dirname(fileURLToPath(import.meta.url))
const SHOTS = join(HERE, 'shots')
mkdirSync(SHOTS, { recursive: true })

const errors = []
const fails = []
const check = (name, cond) => {
  if (!cond) fails.push(name)
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`)
}

// —— 800x600 PNG：让浏览器真画一张再吐字节，不引入编码依赖 ——
async function makePng(page, color, path) {
  const dataUrl = await page.evaluate((c) => {
    const cv = document.createElement('canvas')
    cv.width = 800
    cv.height = 600
    const g = cv.getContext('2d')
    g.fillStyle = c
    g.fillRect(0, 0, 800, 600)
    g.fillStyle = '#00000022'
    g.fillRect(100, 100, 300, 200)
    return cv.toDataURL('image/png')
  }, color)
  const buf = Buffer.from(dataUrl.split(',')[1], 'base64')
  writeFileSync(path, buf)
  return buf
}

const sha256File = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')

async function dump(page) {
  return page.evaluate(() => new Promise((res, rej) => {
    const r = indexedDB.open('banji-journal')
    r.onsuccess = () => {
      const db = r.result
      const out = { journals: [], assets: [] }
      const tj = db.transaction('journals', 'readonly')
      tj.objectStore('journals').getAll().onsuccess = (e1) => {
        out.journals = e1.target.result
          .map((d) => ({ date: d.date, cards: d.cards.map((c) => ({ kind: c.kind, text: c.props?.text, hash: c.props?.hash, w: c.props?.w, h: c.props?.h, pos: c.pos, size: c.size })) }))
          .sort((a, b) => a.date.localeCompare(b.date))
        const ta = db.transaction('assets', 'readonly')
        ta.objectStore('assets').getAll().onsuccess = (e2) => {
          out.assets = e2.target.result.map((a) => ({ hash: a.hash, mime: a.mime, name: a.name ?? null, size: a.size }))
            .sort((a, b) => a.hash.localeCompare(b.hash))
          db.close()
          res(out)
        }
        ta.onerror = () => rej(ta.error)
      }
      tj.onerror = () => rej(tj.error)
    }
    r.onerror = () => rej(r.error)
  }))
}

// IDB 里资产 Blob 的实算 sha256（字节级自证，不是只比索引里的 hash 字段）
const idbAssetSha256 = (page, hash) => page.evaluate(async (h) => {
  const rec = await new Promise((res, rej) => {
    const r = indexedDB.open('banji-journal')
    r.onsuccess = () => {
      const db = r.result
      const tx = db.transaction('assets', 'readonly')
      tx.objectStore('assets').get(h).onsuccess = (e) => { db.close(); res(e.target.result) }
      tx.onerror = () => rej(tx.error)
    }
    r.onerror = () => rej(r.error)
  })
  if (rec === undefined) return null
  const buf = await rec.blob.arrayBuffer()
  const d = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}, hash)

const canonical = (v) =>
  v === null || typeof v !== 'object' ? v : Array.isArray(v) ? v.map(canonical) : Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])]))
const norm = (x) => JSON.stringify(canonical(x))

const browser = await chromium.launch()
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1100, height: 760 } })
const page = await ctx.newPage()
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text()) })
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message))

await page.goto(BASE)
await page.waitForSelector('.bj-cell')
check('boot: calendar rendered', await page.locator('.bj-grid').isVisible())
await page.screenshot({ path: `${SHOTS}/01-calendar.png`, fullPage: true })

const today = await page.evaluate(() => {
  const d = new Date()
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
})
await page.click(`.bj-cell[data-date="${today}"]`)
await page.waitForSelector('.bj-empty, .bj-card')
check('day: opens today empty', (await page.locator('.bj-empty').count()) > 0)
check('day: empty whisper hints 夹带', ((await page.locator('.bj-empty-sub').textContent()) || '').includes('照片'))
await page.screenshot({ path: `${SHOTS}/02-day-empty.png`, fullPage: true })

await page.click('.bj-add')
await page.waitForSelector('textarea', { timeout: 4000 })
const ta = page.locator('textarea').first()
await ta.fill('雨后。楼下槐花开了。\n**加粗测试**\n- 列表一\n- 列表二')
await page.waitForTimeout(1200) // >450ms debounce
await page.screenshot({ path: `${SHOTS}/03-card-typed.png`, fullPage: true })
const d0 = await dump(page)
check('autosave: card persisted to IDB', d0.journals.some((j) => j.cards.some((c) => (c.text || '').includes('槐花'))))

await page.reload()
await page.waitForSelector('.bj-card, .bj-empty')
const bodyTxt = await page.locator('.bj-card-body').first().textContent()
check('reload: card still here', (bodyTxt || '').includes('槐花'))
await page.screenshot({ path: `${SHOTS}/04-reloaded.png`, fullPage: true })

// —— R2 夹带：OS 文件选择器 → 图片卡 ——
const pngClip = join(HERE, 'clip.png')
const pngDrop = join(HERE, 'drop.png')
await makePng(page, '#e8dcc3', pngClip)
await makePng(page, '#d9c8a0', pngDrop)
await page.setInputFiles('input[aria-label="夹带"]', pngClip)
await page.waitForSelector('.bj-card.be-image img.bj-img', { timeout: 8000 })
const clipCard = await dump(page)
const imgCards = clipCard.journals.flatMap((j) => j.cards).filter((c) => c.kind === 'image')
check('夹带: image card created', imgCards.length === 1)
check('夹带: props capped to 420 wide, aspect kept', imgCards[0]?.w === 420 && imgCards[0]?.h === 315)
check('夹带: asset stored with original filename', clipCard.assets.some((a) => a.name === 'clip.png' && a.mime === 'image/png'))
await page.screenshot({ path: `${SHOTS}/12-clip-attached.png`, fullPage: true })

await page.reload()
await page.waitForSelector('.bj-card')
await page.waitForSelector('.bj-card.be-image img.bj-img', { timeout: 8000 })
check('夹带: image still renders after reload', (await page.locator('.bj-card.be-image img.bj-img').count()) === 1)

// —— R2 拖放：画布 drop → 在指针处落卡（headless 用构造的 DragEvent + 真 DataTransfer）——
const b64drop = readFileSync(pngDrop).toString('base64')
await page.evaluate(async (b64) => {
  const blob = await (await fetch('data:image/png;base64,' + b64)).blob()
  const file = new File([blob], '拖入.png', { type: 'image/png' })
  const dt = new DataTransfer()
  dt.items.add(file)
  const canvas = document.querySelector('.bj-canvas')
  const r = canvas.getBoundingClientRect()
  const x = r.left + 320
  const y = r.top + 380
  const mk = (t) => new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y })
  canvas.dispatchEvent(mk('dragenter'))
  canvas.dispatchEvent(mk('dragover'))
  canvas.dispatchEvent(mk('drop'))
}, b64drop)
await page.waitForFunction(() => document.querySelectorAll('.bj-card.be-image img.bj-img').length === 2, null, { timeout: 8000 })
const dropped = (await dump(page)).journals.flatMap((j) => j.cards).find((c) => c.kind === 'image' && Math.abs(c.pos.x - 320) <= 2 && Math.abs(c.pos.y - 380) <= 2)
check('拖放: dropped at pointer (320,380)', dropped !== undefined)
await page.screenshot({ path: `${SHOTS}/13-drop-attached.png`, fullPage: true })

await page.click('.bj-back')
await page.waitForSelector('.bj-cell')
check('calendar: ink dot appears', (await page.locator(`.bj-cell[data-date="${today}"] i.bj-dot`).count()) > 0)
await page.screenshot({ path: `${SHOTS}/05-calendar-dot.png`, fullPage: true })

// —— 导出（此时档案必须含两张图）——
const lightThemeColor = await page.getAttribute('meta[name="theme-color"]', 'content')
check('theme-color: light default paper', lightThemeColor === '#f2ecdf')
await page.click('button[aria-label="设置"]')
await page.waitForTimeout(300)
const dlPromise = page.waitForEvent('download', { timeout: 15000 })
await page.getByRole('button', { name: /导出/ }).click()
const dl = await dlPromise
await dl.saveAs(join(HERE, 'backup.banjizip'))
check('export: download suggested name', dl.suggestedFilename().length > 0)
const d1 = await dump(page)
const clipHash = createHash('sha256').update(readFileSync(pngClip)).digest('hex')
const dropHash = createHash('sha256').update(readFileSync(pngDrop)).digest('hex')
check('assets: both PNGs live in IDB under their file sha256', d1.assets.some((a) => a.hash === clipHash) && d1.assets.some((a) => a.hash === dropHash))
await page.waitForTimeout(400)

await page.evaluate(() => new Promise((res) => {
  const r = indexedDB.deleteDatabase('banji-journal')
  r.onsuccess = r.onerror = r.onblocked = () => res()
}))
await page.goto(BASE)
await page.waitForSelector('.bj-cell')
check('wipe: calendar empty again', (await page.locator('i.bj-dot').count()) === 0)
await page.screenshot({ path: `${SHOTS}/06-wiped.png`, fullPage: true })

await page.click('button[aria-label="设置"]')
await page.waitForTimeout(300)
await page.getByRole('button', { name: /导入/ }).click()
await page.setInputFiles('input.bj-hidden-file', join(HERE, 'backup.banjizip'))
await page.waitForSelector('button:has-text("继续")', { timeout: 8000 })
await page.click('button:has-text("继续")')
await page.waitForSelector('button:has-text("确认替换")', { timeout: 4000 })
await page.click('button:has-text("确认替换")')
await page.waitForTimeout(3000)
await page.reload()
await page.waitForSelector('.bj-cell')
await page.click(`.bj-cell[data-date="${today}"]`)
await page.waitForSelector('.bj-card')
const d2 = await dump(page)
check('HERO: export->wipe->import restores journal incl. attachments', norm(d2) === norm(d1))
if (norm(d2) !== norm(d1)) { console.log('  d1=', norm(d1)); console.log('  d2=', norm(d2)) }
const clipBack = await idbAssetSha256(page, clipHash)
check('HERO: re-imported image bytes sha256-equal the source PNG', clipBack === clipHash)
await page.waitForFunction(() => document.querySelectorAll('.bj-card.be-image img.bj-img').length === 2, null, { timeout: 10000 })
check('attachments visible after import: 2 image cards render', (await page.locator('.bj-card.be-image img.bj-img').count()) === 2)
await page.screenshot({ path: `${SHOTS}/07-imported.png`, fullPage: true })

// —— R4 桌面撕下→再想想：整回合过真 IDB（添卡 → ⋯ 删 → 行动回执 → 再想想 → 逐字回位 → reload 仍在）——
await page.click('.bj-add')
await page.waitForSelector('textarea', { timeout: 4000 })
await page.locator('textarea').first().fill('撕下又想起')
await page.click('.bj-scroll', { position: { x: 6, y: 6 } }) // 背景：exitEdit + flushNow（编辑当场结算）
await page.waitForTimeout(700)
const undoCard = page.locator('.bj-card', { hasText: '撕下又想起' }).first()
const geom0 = await undoCard.evaluate((el) => [Number(el.style.left.replace('px', '')), Number(el.style.top.replace('px', '')), Number(el.style.width.replace('px', '')), Number(el.style.height.replace('px', ''))])
await undoCard.click({ position: { x: 20, y: 12 } }) // 点选（角落避开便签浮层）
await page.click('[aria-label="卡片菜单"]')
await page.click('.bj-menu-item:has-text("删除")')
await page.click('button:has-text("确认删除")')
await page.waitForSelector('.bj-toast', { timeout: 4000 })
const undoToastTxt = (await page.locator('.bj-toast').first().textContent()) || ''
check('R4 桌面 撕下: 行动回执便签「已撕下 1 张，再想想」（发丝边）', undoToastTxt === '已撕下 1 张，再想想' && (await page.locator('.bj-toast.bj-toast-alert').count()) === 0)
check('R4 桌面 撕下: 卡即刻离纸', (await undoCard.count()) === 0)
await page.screenshot({ path: `${SHOTS}/16-toast-undo.png`, fullPage: true })
await page.click('.bj-toast .bj-toast-action')
await undoCard.waitFor({ timeout: 5000 })
const geom1 = await undoCard.evaluate((el) => [Number(el.style.left.replace('px', '')), Number(el.style.top.replace('px', '')), Number(el.style.width.replace('px', '')), Number(el.style.height.replace('px', ''))])
check('R4 桌面 再想想: 卡回到原位（pos/size 逐像素 ±2）', geom0.every((v, i) => Math.abs(v - geom1[i]) <= 2))
await page.reload()
await page.waitForSelector('.bj-card')
const dUndo = await dump(page)
check('R4 桌面 再想想: 恢复已过真缝落库，reload 仍在', dUndo.journals.flatMap((j) => j.cards).some((c) => (c.text || '').includes('撕下又想起')))
await page.click('.bj-back')
await page.waitForSelector('.bj-cell')

// —— 夜读主题 + theme-color 翻转 + 持久化 ——
await page.click('button[aria-label="设置"]')
await page.getByRole('button', { name: /夜读/ }).first().click().catch(async () => { await page.locator('text=夜读').first().click() })
await page.waitForTimeout(500)
const nightOn = await page.evaluate(() => document.documentElement.getAttribute('data-bj-theme'))
const nightThemeColor = await page.getAttribute('meta[name="theme-color"]', 'content')
check('theme: night applies', nightOn === 'night')
check('theme: theme-color flips with night', nightThemeColor === '#171310')
await page.screenshot({ path: `${SHOTS}/08-night.png`, fullPage: true })
await page.reload()
await page.waitForTimeout(900)
const nightPersisted = await page.evaluate(() => document.documentElement.getAttribute('data-bj-theme'))
const nightColorPersisted = await page.getAttribute('meta[name="theme-color"]', 'content')
check('theme: night persists reload', nightPersisted === 'night')
check('theme: theme-color persists reload (pre-paint guard)', nightColorPersisted === '#171310')
await page.screenshot({ path: `${SHOTS}/09-night-reloaded.png`, fullPage: true })
await ctx.close()

// —— 移动端 390px ——
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true })
const mpage = await mctx.newPage()
mpage.on('console', (m) => { if (m.type() === 'error') errors.push('[m-console] ' + m.text()) })
mpage.on('pageerror', (e) => errors.push('[m-pageerror] ' + e.message))
await mpage.goto(BASE)
await mpage.waitForSelector('.bj-cell')
await mpage.screenshot({ path: `${SHOTS}/10-mobile-empty.png`, fullPage: true })
await mpage.click('button[aria-label="设置"]')
await mpage.waitForTimeout(300)
await mpage.getByRole('button', { name: /导入/ }).click()
await mpage.setInputFiles('input.bj-hidden-file', join(HERE, 'backup.banjizip'))
await mpage.waitForSelector('button:has-text("继续")', { timeout: 8000 })
await mpage.click('button:has-text("继续")')
await mpage.waitForSelector('button:has-text("确认替换")', { timeout: 4000 })
await mpage.click('button:has-text("确认替换")')
await mpage.waitForTimeout(3000)
await mpage.reload()
await mpage.waitForSelector('.bj-cell')
await mpage.click(`.bj-cell[data-date="${today}"]`)
await mpage.waitForSelector('.bj-card')
await mpage.screenshot({ path: `${SHOTS}/11-mobile-day.png`, fullPage: true })
check('mobile: day renders after import', true)

// —— R3 主屏适配：手机是手札的主设备，全部断言在 390×844 真浏览器上过秤 ——
// React 重渲染窗口内 locator 动作易 flake（"element is not attached"），几何一律页内 getBoundingClientRect 实测。
const pngPhone = join(HERE, 'phone.png')
await makePng(mpage, '#e5d5b0', pngPhone)
const imgBefore = await mpage.locator('.bj-card.be-image').count()
await mpage.setInputFiles('input[aria-label="夹带"]', pngPhone)
await mpage.waitForFunction((n) => document.querySelectorAll('.bj-card.be-image').length === n + 1, imgBefore, { timeout: 8000 })
await mpage.waitForTimeout(700) // 虚影熄灭 + settle 动画落定
const imgGeom = await mpage.evaluate(() => {
  const els = [...document.querySelectorAll('.bj-card.be-image')]
  const el = els[els.length - 1]
  el.scrollIntoView({ block: 'center' })
  const r = el.getBoundingClientRect()
  return { width: r.width, x: r.x, right: r.right, y: r.y, bottom: r.bottom }
})
check('mobile 夹带: 图片卡宽 ≤ 350 (390-40)', imgGeom.width <= 350)
check('mobile 夹带: 滚动可达后完整在屏内（含 24px 呼吸）', imgGeom.x >= 0 && imgGeom.right <= 390 && imgGeom.y >= 0 && imgGeom.bottom <= 844)
const d3 = await dump(mpage)
const phoneCard = d3.journals.flatMap((j) => j.cards).find((c) => c.kind === 'image' && c.size?.w === 318)
check('mobile 夹带: 存储即窄屏尺寸 size=318 props=290x218 pos.x=24', phoneCard !== undefined && phoneCard.w === 290 && phoneCard.h === 218 && phoneCard.pos?.x === 24)
await mpage.screenshot({ path: `${SHOTS}/14-mobile-attach.png` })

await mpage.tap('.bj-add')
const taM = mpage.locator('textarea').first()
await taM.waitFor({ timeout: 4000 })
await taM.fill('手机上落的一笔。')
const taGeom = await mpage.evaluate(() => {
  const r = document.querySelector('textarea').getBoundingClientRect()
  return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, focused: document.activeElement?.tagName === 'TEXTAREA' }
})
check('mobile 键盘避让: 聚焦编辑器被滚进视口且持有焦点', taGeom.focused && taGeom.y >= 0 && taGeom.bottom <= 844 && taGeom.right <= 390)
await mpage.screenshot({ path: `${SHOTS}/15-mobile-editor.png` })
await mpage.waitForTimeout(1200)
await mpage.reload()
await mpage.waitForSelector('.bj-card')
await mpage.waitForFunction((n) => document.querySelectorAll('.bj-card.be-image').length === n, imgBefore + 1, { timeout: 8000 })
const d4 = await dump(mpage)
const stillPhone = d4.journals.flatMap((j) => j.cards).some((c) => c.kind === 'image' && c.size?.w === 318 && c.w === 290)
const stillText = d4.journals.flatMap((j) => j.cards).some((c) => (c.text || '').includes('手机上落的一笔'))
check('mobile reload: 窄屏图片卡与文字卡都还在', stillPhone && stillText)

// —— R4 移动端：真触摸序列拖卡过缝落库；桌面时代日子在 390 屏的宽画布耳语 ——
// headless 无手指：CDP Input.dispatchTouchEvent 是浏览器级真 touch（pointerType='touch'），
// 卡片 CSS 有 touch-action:none，指针捕获与移动全走线上代码路径。
const cdp = await mctx.newCDPSession(mpage)
async function touchDrag(x0, y0, x1, y1, steps = 12) {
  const p = (x, y) => ({ x, y, radiusX: 1, radiusY: 1, force: 1 })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p(x0, y0)] })
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps)] })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}
const dragFrom = await mpage.evaluate(() => {
  const els = [...document.querySelectorAll('.bj-card')].filter((e) => (e.textContent || '').includes('手机上落的一笔'))
  const el = els[0]
  if (el === undefined) return null
  el.scrollIntoView({ block: 'center' })
  const r = el.getBoundingClientRect()
  return { x: r.x + 24, y: r.y + 14, left: Number(el.style.left.replace('px', '')), top: Number(el.style.top.replace('px', '')) }
})
await touchDrag(dragFrom.x, dragFrom.y, dragFrom.x + 40, dragFrom.y - 120)
await mpage.waitForTimeout(1500) // debounce 450 + 串行链落库
await mpage.reload()
await mpage.waitForSelector('.bj-card')
const dragNow = await mpage.evaluate(() => {
  const els = [...document.querySelectorAll('.bj-card')].filter((e) => (e.textContent || '').includes('手机上落的一笔'))
  const el = els[0]
  if (el === undefined) return null
  return { left: Number(el.style.left.replace('px', '')), top: Number(el.style.top.replace('px', '')) }
})
const moved = dragNow !== null && Math.abs(dragNow.left - (dragFrom.left + 40)) <= 2 && Math.abs(dragNow.top - (dragFrom.top - 120)) <= 2
check('mobile 真触摸拖卡: (+40,-120) 位移过缝落库、reload 仍在', moved)
await mpage.screenshot({ path: `${SHOTS}/17-mobile-touchmove.png` })

const hint = await mpage.waitForSelector('.bj-wide-hint', { timeout: 6000 }).catch(() => null)
const whisperOn = hint !== null && ((await hint.textContent()) || '').includes('纸比屏宽')
check('mobile 宽画布耳语: 桌面时代日子在 390 屏低语', whisperOn)
await mpage.screenshot({ path: `${SHOTS}/18-wide-whisper.png` })
await mpage.evaluate(() => {
  const s = document.querySelector('.bj-scroll')
  s.scrollLeft += 200
})
await mpage.waitForTimeout(600) // is-fading ≤220ms 后撤场
const hintFlag = await mpage.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('banji-journal')
  r.onsuccess = () => {
    const db = r.result
    const tx = db.transaction('settings', 'readonly')
    tx.objectStore('settings').get('hint_wide_canvas').onsuccess = (e) => { db.close(); res(e.target.result?.value === true) }
    tx.onerror = () => { db.close(); res(false) }
  }
  r.onerror = () => res(false)
}))
check('mobile 耳语: 横向首推即淡出并 setSetting 记档', (await mpage.locator('.bj-wide-hint').count()) === 0 && hintFlag === true)
await mpage.reload()
await mpage.waitForSelector('.bj-card')
await mpage.waitForTimeout(900)
check('mobile 耳语: 记档之后终生不再扰（reload 不响）', (await mpage.locator('.bj-wide-hint').count()) === 0)
await mctx.close()

await browser.close()
console.log('\nCONSOLE ERRORS:', errors.length)
errors.slice(0, 10).forEach((e) => console.log('  !', e))
console.log(fails.length ? `\n${String(fails.length)} FAILURES:\n` + fails.map((f) => '  - ' + f).join('\n') : '\nALL CHECKS PASSED')
process.exit(fails.length || errors.length ? 1 : 0)
