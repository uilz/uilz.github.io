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
          .map((d) => ({ date: d.date, cards: d.cards          .map((c) => ({ id: c.id, kind: c.kind, text: c.props?.text, hash: c.props?.hash, w: c.props?.w, h: c.props?.h, name: c.props?.name ?? null, url: c.props?.url, pos: c.pos, size: c.size, children: c.children ?? null })) }))
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

// —— R5 纸叠（桌面全流程）：造叠空垫纸+耳语 → 拖纸悬停落点态 → 释放收编过缝 → reload 嵌套在纸内
//    → 空处拖垫纸整树平移 → 拖子纸出界断奶落库。几何全部页内 getBoundingClientRect 实测。 ——
const btnDash = await page.evaluate(() => {
  const r = document.querySelector('.bj-add-wrap button[aria-label="造叠"] svg rect')
  return r !== null && String(r.getAttribute('stroke-dasharray') ?? '').length > 0
})
check('R5 D1 底栏第三枚把手：虚线矩形手绘 svg', btnDash)

await page.click('.bj-add')
await page.waitForSelector('textarea', { timeout: 4000 })
await page.locator('textarea').first().fill('入叠帖')
await page.click('.bj-scroll', { position: { x: 6, y: 6 } }) // 落笔结算
await page.waitForTimeout(700)
await page.click('button[aria-label="造叠"]')
await page.waitForSelector('.bj-card.be-container', { timeout: 4000 })
const matBorn = await page.evaluate(() => {
  const m = document.querySelector('.bj-card.be-container')
  return { sel: m.classList.contains('is-sel'), whisper: m.querySelector('.bj-stack-whisper')?.textContent ?? '' }
})
check('R5 D1+D2 造叠即落空垫纸且即刻选中：耳语候着', matBorn.sel === true && matBorn.whisper === '拖一张纸进来，它们就是一叠了')
await page.screenshot({ path: `${SHOTS}/19-stack-mat.png`, fullPage: true })

async function matKidRects() {
  return page.evaluate(() => {
    const m = document.querySelector('.bj-card.be-container')
    const k = [...document.querySelectorAll('.bj-card:not(.be-container)')].find((e) => (e.textContent || '').includes('入叠帖'))
    if (m === null || k === undefined) return null
    const mr = m.getBoundingClientRect()
    const kr = k.getBoundingClientRect()
    return { mx: mr.x, my: mr.y, mw: mr.width, mh: mr.height, kx: kr.x, ky: kr.y, kidId: k.getAttribute('data-card-id') }
  })
}
await page.evaluate(() => document.querySelector('.bj-card.be-container').scrollIntoView({ block: 'center' }))
const g0 = await matKidRects()
await page.mouse.move(g0.kx + 24, g0.ky + 14)
await page.mouse.down()
await page.mouse.move(g0.kx + 80, g0.ky + 120, { steps: 5 })
await page.mouse.move(g0.mx + g0.mw / 2, g0.my + g0.mh / 2, { steps: 8 })
await page.waitForTimeout(120) // pointermove 属 React 连续事件：让落点态一帧内上屏
const droponMid = await page.evaluate(() => document.querySelectorAll('.bj-card.be-container.is-dropon').length)
check('R5 D3 拖入悬停：指针下垫纸现落点态 is-dropon（瞬态）', droponMid === 1)
await page.mouse.up()
await page.waitForTimeout(1400) // debounce 450 + 串行链
const noteLive = (await page.locator('.bj-stack-note').textContent().catch(() => '')) || ''
check('R5 D2 收编后垫纸左上「1 张」铅笔小注', noteLive.trim() === '1 张')
await page.reload()
await page.waitForSelector('.bj-card.be-container')
const dS = await dump(page)
const dayS = dS.journals.find((j) => j.date === today)
const matC = dayS.cards.find((c) => c.kind === 'container')
const kidC = dayS.cards.find((c) => c.text === '入叠帖')
check('R5 D3 reload 后 children 过缝落库（IDB 实dump）', matC.children?.includes(kidC.id) === true)
const keyleak = await page.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('banji-journal')
  r.onsuccess = () => {
    const db = r.result
    const tx = db.transaction('journals', 'readonly')
    tx.objectStore('journals').getAll().onsuccess = (e) => {
      db.close()
      const keys = ['id', 'kind', 'pos', 'size', 'z', 'rot', 'children', 'meta', 'props', 'createdAt', 'updatedAt']
      res(e.target.result.some((d) => d.cards.some((c) => Object.keys(c).some((k) => !keys.includes(k)))))
    }
    tx.onerror = () => res(true)
  }
  r.onerror = () => res(true)
}))
check('R5 D3 瞬态字段永不过缝：全部卡片键 ⊆ 契约字段', keyleak === false)
await page.evaluate(() => document.querySelector('.bj-card.be-container').scrollIntoView({ block: 'center' }))
const nest = await matKidRects()
const insideAbove = await page.evaluate((n) => {
  const m = document.querySelector('.bj-card.be-container')
  const k = document.querySelector(`[data-card-id="${n.kidId}"]`)
  const mr = m.getBoundingClientRect()
  const kr = k.getBoundingClientRect()
  return kr.x >= mr.x - 2 && kr.y >= mr.y - 2 && kr.right <= mr.right + 2 && kr.bottom <= mr.bottom + 2 && Number(k.style.zIndex) > Number(m.style.zIndex)
}, nest)
check('R5 D2 子纸渲染于垫纸界内且压在其上（渲染序派生）', insideAbove)
await page.screenshot({ path: `${SHOTS}/20-stack-inside.png`, fullPage: true })

const g1 = await matKidRects()
await page.mouse.move(g1.mx + 10, g1.my + 10) // 垫纸空处（子纸永远在界内 ≥24px 之外才能落指）
await page.mouse.down()
await page.mouse.move(g1.mx + 150, g1.my + 70, { steps: 6 })
await page.mouse.up()
await page.waitForTimeout(900)
const g2 = await matKidRects()
const movedTree = Math.abs(g2.mx - (g1.mx + 140)) <= 2 && Math.abs(g2.kx - (g1.kx + 140)) <= 2
check('R5 D5 空处拖垫纸：整棵子树同位移（子纸 ±2px 跟移）', movedTree)

await page.mouse.move(g2.kx + 24, g2.ky + 14)
await page.mouse.down()
await page.mouse.move(g2.mx - 260, g2.my - 60, { steps: 8 }) // 出界：越过垫纸左缘与上缘之外
await page.mouse.up()
await page.waitForTimeout(1400)
await page.reload()
await page.waitForSelector('.bj-card.be-container')
const dOut = await dump(page)
const dayOut = dOut.journals.find((j) => j.date === today)
const matOut = dayOut.cards.find((c) => c.kind === 'container')
const kidOut = dayOut.cards.find((c) => c.text === '入叠帖')
const backWhisper = ((await page.locator('.bj-card.be-container .bj-stack-whisper').textContent().catch(() => '')) || '').includes('拖一张纸进来')
check('R5 D4 拖出垫纸界外：断奶过缝落库，垫纸退回耳语', (matOut.children === null || matOut.children?.includes(kidOut.id) === false) && backWhisper)
check('R5 D4 出界位移持久：reload 后子纸仍在界外新位', Math.abs(kidOut.pos.x - matOut.pos.x) > 0 && kidOut.pos.x < matOut.pos.x)
await page.screenshot({ path: `${SHOTS}/21-stack-detached.png`, fullPage: true })

// —— R6 档案中毒判死（桌面）：把子纸再收编回垫纸 → 撕下 → 任 10s 托盘静默过期（回天之门焊死）→
//    导出（下载落盘）→ wipe IDB → 抽屉双确认重导 → reload 开日。
//    修复前：过期后 dangling 引用长住 children[]，自家档案必死在自家导入闸（journal.child_missing），
//    wipe 之后等于数据无门可回。prune-at-delete-commit 后此路全绿，且「N 张」永不数到幽灵。
{
  const seed = await page.evaluate(() => {
    const m = document.querySelector('.bj-card.be-container')
    const k = [...document.querySelectorAll('.bj-card:not(.be-container)')].find((e) => (e.textContent || '').includes('入叠帖'))
    if (m === null || k === undefined) return null
    m.scrollIntoView({ block: 'center' })
    const mr = m.getBoundingClientRect()
    const kr = k.getBoundingClientRect()
    return { mx: mr.x, my: mr.y, mw: mr.width, mh: mr.height, kx: kr.x, ky: kr.y, kidId: k.getAttribute('data-card-id') }
  })
  if (seed === null) throw new Error('R6 夹具：桌上没有垫纸或子纸')
  await page.mouse.move(seed.kx + 24, seed.ky + 14)
  await page.mouse.down()
  await page.mouse.move(seed.kx + 80, seed.ky + 120, { steps: 5 })
  await page.mouse.move(seed.mx + seed.mw / 2, seed.my + seed.mh / 2, { steps: 8 })
  await page.mouse.up()
  await page.waitForFunction(() => document.querySelector('.bj-card.be-container .bj-stack-note')?.textContent?.trim() === '1 张', null, { timeout: 8000 })
  let matPre = null
  for (let i = 0; i < 24 && matPre?.children?.includes(seed.kidId) !== true; i++) {
    await page.waitForTimeout(250) // debounce 450 + 串行链：等真缝落库，别拿乐观 DOM 当过缝证据
    matPre = (await dump(page)).journals.find((j) => j.date === today)?.cards.find((c) => c.kind === 'container') ?? null
  }
  if (matPre?.children?.includes(seed.kidId) !== true) throw new Error('R6 夹具：收编没过缝，毒从何处来')
  await page.click(`[data-card-id="${seed.kidId}"]`, { position: { x: 20, y: 12 } })
  await page.click('[aria-label="卡片菜单"]')
  await page.click('.bj-menu-item:has-text("删除")')
  await page.click('button:has-text("确认删除")')
  await page.waitForSelector('.bj-toast', { timeout: 4000 })
  const poisonToast = ((await page.locator('.bj-toast').first().textContent()) || '').trim()
  if (poisonToast !== '已撕下 1 张，再想想') throw new Error(`R6 夹具：撕下回执不对（${poisonToast}）`)
  await page.waitForTimeout(11_000) // 10s TTL + 余量：纸片归尘，撤销之路自此焊死
  if ((await page.locator('.bj-toast').count()) !== 0) throw new Error('R6：过期不寂静（残影/警报 = 剥离没存上）')
  const dPoison = await dump(page)
  const matPoison = dPoison.journals.find((j) => j.date === today)?.cards.find((c) => c.kind === 'container')
  const kidPoison = dPoison.journals.find((j) => j.date === today)?.cards.some((c) => c.text === '入叠帖')
  if (matPoison === undefined || kidPoison) throw new Error('R6 夹具：过期后库内状态不对')
  if (matPoison.children !== null && matPoison.children.length !== 0) throw new Error(`R6：幽灵还住在库里 children=${JSON.stringify(matPoison.children)}`)
  await page.click('.bj-day-head [aria-label="设置"]')
  await page.waitForTimeout(300)
  const dlPoisonPromise = page.waitForEvent('download', { timeout: 15000 })
  await page.getByRole('button', { name: /导出/ }).click()
  const dlPoison = await dlPoisonPromise
  await dlPoison.saveAs(join(HERE, 'expired-strip.banjizip'))
  await page.evaluate(() => new Promise((res) => {
    const r = indexedDB.deleteDatabase('banji-journal')
    r.onsuccess = r.onerror = r.onblocked = () => res()
  }))
  await page.goto(BASE)
  await page.waitForSelector('.bj-cell')
  await page.click('button[aria-label="设置"]')
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: /导入/ }).click()
  await page.setInputFiles('input.bj-hidden-file', join(HERE, 'expired-strip.banjizip'))
  await page.waitForSelector('button:has-text("继续")', { timeout: 8000 })
  await page.click('button:has-text("继续")')
  await page.waitForSelector('button:has-text("确认替换")', { timeout: 4000 })
  await page.click('button:has-text("确认替换")')
  await page.waitForTimeout(3000)
  await page.reload()
  await page.waitForSelector('.bj-cell')
  await page.click(`.bj-cell[data-date="${today}"]`)
  await page.waitForSelector('.bj-card.be-container', { timeout: 8000 })
  const poisonNotes = await page.locator('.bj-card.be-container .bj-stack-note').count()
  const poisonWhisper = ((await page.locator('.bj-card.be-container .bj-stack-whisper').textContent().catch(() => '')) || '').includes('拖一张纸进来')
  const dPoisonBack = await dump(page)
  const matBack = dPoisonBack.journals.find((j) => j.date === today)?.cards.find((c) => c.kind === 'container')
  const poisonDead = (matBack?.children === null || matBack?.children?.length === 0) && poisonNotes === 0 && poisonWhisper
  check('R6 档案中毒判死: 撕子纸→10s过期→导出→wipe→重导过闸→开日，垫纸诚实耳语、库里档里没有幽灵', poisonDead)
  await page.screenshot({ path: `${SHOTS}/23-poison-imported.png`, fullPage: true })
}

// —— R6 债#6 + R10 债#5 真浏览器竞态(桌面)：开火中途的旧世界意图撞上导入 commit——屏障先放行、后抹除 ——
// 剧本：把子纸收编回垫纸过缝（staged 宇宙 = 真档案有 children）→ 导出暂存档案 →
//       给 journals.get 装一次性挂起闸（deleteCardCascade 的读-改-写缝就钉死在链上：撕下那一笔的
//       前置链上意图只余半条命）→ 撕子纸（挂起点=开火中途实锤）→ 拖散纸（第二笔旧世界意图）→
//       ack 先过再放行。修前旁路（R9 记债实锤）：阶段 0-2 只几十毫秒，commit 事务先诞生，
//       迟醒的意图把事务排在其后 → 新宇宙里 strip 现形 = 谎言档案。修后（R10 屏障）：commit 是
//       writeChain 的链上环节——在途未落定前它绝不诞生（挂账探针 1500ms 静默为本轮主证），放行后
//       旧世界之笔先落再被整体抹掉；重导深相等 + children 依档还原 + ack 后新笔照常（只弃旧不毒新）。
{
  // 「撕下又想起」当将入叠的纸。先拉高视口：两张纸同在屏内才敢按 rect 拖（滚动位移会骗过 clientY）。
  await page.setViewportSize({ width: 1100, height: 2400 })
  const nest = await page.evaluate(() => {
    const m = document.querySelector('.bj-card.be-container')
    const k = [...document.querySelectorAll('.bj-card:not(.be-container)')].find((e) => (e.textContent || '').includes('撕下又想起'))
    if (m === null || k === undefined) return null
    const mr = m.getBoundingClientRect()
    const kr = k.getBoundingClientRect()
    const grabAt = { x: kr.x + 24, y: kr.y + 14 }
    const top = document.elementFromPoint(grabAt.x, grabAt.y)
    const holder = top instanceof Element ? top.closest('[data-card-id]') : null
    if (holder !== k || kr.bottom > 2400 || mr.bottom > 2400) return { bad: JSON.stringify({ holder: holder?.getAttribute('data-card-id'), kid: k.getAttribute('data-card-id') }) }
    return { mx: mr.x, my: mr.y, mw: mr.width, mh: mr.height, kx: kr.x, ky: kr.y, kidId: k.getAttribute('data-card-id') }
  })
  if (nest === null || nest.bad !== undefined) throw new Error(`债#6 夹具：抓不到可收编的纸 — ${nest?.bad ?? '缺垫纸或子纸'}`)
  const dragTo = async (x0, y0, x1, y1) => {
    await page.mouse.move(x0, y0)
    await page.mouse.down()
    await page.mouse.move(x0 + 60, y0 + 90, { steps: 5 })
    await page.mouse.move(x1, y1, { steps: 8 })
    await page.mouse.up()
  }
  await dragTo(nest.kx + 24, nest.ky + 14, nest.mx + nest.mw / 2, nest.my + nest.mh / 2) // 收编回叠
  const noteUp = await page
    .waitForFunction(() => document.querySelector('.bj-card.be-container .bj-stack-note')?.textContent?.trim() === '1 张', null, { timeout: 8000 })
    .then(() => true)
    .catch(() => false)
  if (!noteUp) {
    const probe = await page.evaluate(() => ({
      cards: [...document.querySelectorAll('.bj-card')].map((e) => ({ id: e.getAttribute('data-card-id'), kind: e.className.match(/be-\S+/)?.[0], t: (e.textContent || '').slice(0, 14) })),
      note: document.querySelector('.bj-card.be-container .bj-stack-note')?.textContent ?? null,
    }))
    await page.screenshot({ path: `${SHOTS}/24a-d1-nest-fail.png`, fullPage: true })
    throw new Error(`债#6 夹具：收编未上小注 — ${JSON.stringify(probe)}`)
  }
  const stagedMat = await (async () => {
    for (let i = 0; i < 24; i++) {
      const c = (await dump(page)).journals.find((j) => j.date === today)?.cards.find((x) => x.kind === 'container')
      if (c?.children?.includes(nest.kidId)) return c
      await page.waitForTimeout(250) // 等真缝落库，别拿乐观 DOM 当过缝证据
    }
    throw new Error('债#6 夹具：收编没过缝')
  })()
  const staged = await dump(page)
  await page.click('.bj-day-head [aria-label="设置"]')
  const dlStaged = page.waitForEvent('download', { timeout: 15000 })
  await page.getByRole('button', { name: /导出/ }).click()
  await (await dlStaged).saveAs(join(HERE, 'd1-stage.banjizip'))
  await page.waitForTimeout(400)
  await page.click('button[aria-label="关闭设置"]') // 合上抽屉，撕纸手势才够得着纸
  await page.waitForTimeout(250)
  // R10 对抗开火台（债#5 死）：一次性挂起闸钉在 journals.get 的成功回调上——撕下第一笔（置顶 z 补丁
  // 的 updateCard 读-改-写腿）就此卡在半路：链头已让过（worldGen 验证在开火前）、IDB 事务只活半条。
  // 另一只探针钉在 IDBDatabase.transaction 上数 5-store readwrite 事务的诞生（commitStaging 独此一家）。
  // ack 先行、放行在后：修前（旁路 commit）阶段 0-2 几十毫秒内事务就诞生、探针窗口见血；
  // 修后 commit 是链上环节——挂起者不结算它绝不诞生（探针 1500ms 静默），放行后其写先入旧世界、
  // 被后续 commit 的 clear 整体抹掉，再迟一步开火的 move 按 R6 代数在链头弃权——一窗三腿全钉。
  await page.evaluate(() => {
    const proto = IDBObjectStore.prototype
    const realGet = proto.get
    window.__bjCommitTx = 0
    window.__bjHangArmed = true
    window.__bjHanged = false
    window.__bjRelease = () => undefined
    proto.get = function (q) {
      const req = realGet.call(this, q)
      if (window.__bjHangArmed && !window.__bjHanged && this.name === 'journals') {
        window.__bjHanged = true
        window.__bjHangArmed = false
        Object.defineProperty(req, 'onsuccess', {
          configurable: true,
          get: () => null,
          set: (fn) => {
            window.__bjRelease = () => {
              window.__bjRelease = () => undefined
              fn.call(req)
            }
          },
        })
      }
      return req
    }
    const dbProto = IDBDatabase.prototype
    const realTx = dbProto.transaction
    dbProto.transaction = function (names, mode, options) {
      if (mode === 'readwrite' && Array.isArray(names) && names.length === 5) window.__bjCommitTx += 1
      return realTx.call(this, names, mode, options)
    }
  })
  await page.click(`[data-card-id="${nest.kidId}"]`, { position: { x: 20, y: 12 } })
  await page.click('[aria-label="卡片菜单"]')
  await page.click('.bj-menu-item:has-text("删除")')
  await page.click('button:has-text("确认删除")')
  await page.waitForFunction(() => window.__bjHanged === true, null, { timeout: 8000 })
  const loose = await page.evaluate(() => {
    const k = [...document.querySelectorAll('.bj-card:not(.be-container)')].find((e) => (e.textContent || '').includes('槐花'))
    if (k === undefined) return null
    const r = k.getBoundingClientRect()
    const top = document.elementFromPoint(r.x + 24, r.y + 14)
    if (!(top instanceof Element) || top.closest('[data-card-id]') !== k) return null
    return { x: r.x, y: r.y }
  })
  if (loose === null) throw new Error('债#6 夹具：没有可抓到的散纸')
  await dragTo(loose.x + 24, loose.y + 14, loose.x + 90, loose.y + 16) // 第二笔旧世界意图（ack 时必在弃权位）
  await page.click('.bj-day-head [aria-label="设置"]')
  await page.getByRole('button', { name: /导入/ }).click()
  await page.setInputFiles('input.bj-hidden-file', join(HERE, 'd1-stage.banjizip'))
  await page.waitForSelector('button:has-text("继续")', { timeout: 8000 })
  await page.click('button:has-text("继续")')
  await page.click('button:has-text("确认替换")')
  const commitEarly = await page
    .waitForFunction(() => window.__bjCommitTx > 0, null, { timeout: 1500, polling: 40 })
    .then(() => true)
    .catch(() => false)
  check('R10 屏障正证: 在途开火未结算时 commit 事务绝不诞生（修前旁路早已落笔——回归探针）', commitEarly === false)
  await page.evaluate(() => window.__bjRelease()) // 放行：挂起者的写先落旧世界 → 随后 commit 整体抹掉
  await page.waitForTimeout(1400) // 越过 450ms 窗：未被抹除/未弃权的旧意图会在这段里过缝现形
  await page.reload() // ack 发生在日路由上：reload 后停在当日（宇宙已由 onImported 换过）
  await page.waitForSelector('.bj-card.be-container', { timeout: 8000 })
  const back = await dump(page)
  const matBack2 = back.journals.find((j) => j.date === today)?.cards.find((x) => x.kind === 'container')
  check('R6 债#6 ack 弃在途: 重导日逐字节 ≡ staged 档案（无幽灵 strip、无鬼移位）', norm(back) === norm(staged))
  if (norm(back) !== norm(staged)) { console.log('  staged=', norm(staged)); console.log('  back  =', norm(back)) }
  check('R6 债#6 档案里的 children 依档还原（垫纸 legitimate 收编不被老世界抹平）', matBack2?.children?.length === 1 && stagedMat !== null)
  // 队列不毒：ack 之后的新意图照常排链过缝（同库同实例，先验 IDB 再 reload）
  await page.click('.bj-add')
  await page.waitForSelector('textarea', { timeout: 4000 })
  await page.locator('textarea').first().fill('ack 后的新落笔')
  await page.click('.bj-scroll', { position: { x: 6, y: 6 } })
  let postEdited = false
  for (let i = 0; i < 40 && !postEdited; i++) {
    await page.waitForTimeout(200) // debounce 450 + 串行链：单次开库读，别用 rAF 频率轰炸 IDB 连接队列
    postEdited = await page.evaluate(() => new Promise((res) => {
      const r = indexedDB.open('banji-journal')
      r.onsuccess = () => {
        const db = r.result
        const tx = db.transaction('journals', 'readonly')
        tx.objectStore('journals').getAll().onsuccess = (e) => {
          db.close()
          res(e.target.result.some((d) => d.cards.some((c) => (c.props?.text || '').includes('ack 后的新落笔'))))
        }
        tx.onerror = () => { db.close(); res(false) }
      }
      r.onerror = () => res(false)
    }))
  }
  check('R6 债#6 队列不毒: ack 后新编辑照常 450ms 过缝落库', postEdited === true)
  await page.screenshot({ path: `${SHOTS}/24-ack-discarded.png`, fullPage: true })
  await page.setViewportSize({ width: 1100, height: 760 })
}

// —— R6 债#3 自动滚屏布线（真浏览器）：按住纸拖进滚动窗底缘带、静置 600ms ——
// rAF 圈该把窗推走（纸从指针下溜过）；松手后位移过缝。几何封顶/缓入由 placement 单测钉死，这里只证布线活。
{
  const g = await page.evaluate(() => {
    const k = [...document.querySelectorAll('.bj-card:not(.be-container)')].find((e) => (e.textContent || '').includes('槐花'))
    if (k === undefined) return null
    const r = k.getBoundingClientRect()
    const s = document.querySelector('.bj-scroll').getBoundingClientRect()
    return { x: r.x + 24, y: r.y + 14, top: s.top, bottom: s.bottom, scroll0: document.querySelector('.bj-scroll').scrollTop }
  })
  if (g === null) throw new Error('债#3 夹具：没有可拖的纸上')
  await page.mouse.move(g.x, g.y)
  await page.mouse.down()
  await page.mouse.move(g.x + 80, g.bottom - 20, { steps: 10 }) // 压进底缘 48px 带
  await page.waitForTimeout(700) // 让 rAF 圈推一段
  const pushed = await page.evaluate((s0) => document.querySelector('.bj-scroll').scrollTop - s0, g.scroll0)
  await page.mouse.up()
  await page.waitForTimeout(900) // 落笔过缝；滚屏本身只住屏幕惯性，无存储面（契约键集在 R5 断言已钉死）
  check(`R6 债#3 自动滚屏布线：指压底缘 700ms 滚动窗自走 ${String(pushed)}px（>8）`, pushed > 8)
}

// —— R7 关系系统（桌面全流程 D1-D6）：牵线→纸黄昏→点靶成线→reload 还在→撕线→再牵→跨日「牵给近日」→
//    撕端点卡 10s 反悔（卡与线同回）→线模式串珠+点珠翻页→导出→wipe→导入（线随档案回魂，边逐字）。
{
  const edgesDump = () => page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('banji-journal')
    r.onsuccess = () => {
      const db = r.result
      const tx = db.transaction('edges', 'readonly')
      tx.objectStore('edges').getAll().onsuccess = (e) => {
        db.close()
        res(e.target.result.slice().sort((a, b) => a.id.localeCompare(b.id)))
      }
      tx.onerror = () => { db.close(); res(null) }
    }
    r.onerror = () => res(null)
  }))
  // 昨日的纸：直写 IDB（契约形状），「牵给近日」才有真纸可牵
  const prev = await page.evaluate(() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    const iso = new Date().toISOString()
    const date = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
    return new Promise((res, rej) => {
      const r = indexedDB.open('banji-journal')
      r.onsuccess = () => {
        const db = r.result
        const tx = db.transaction('journals', 'readwrite')
        tx.objectStore('journals').put({
          date,
          cards: [{ id: 'r7-yesterday', kind: 'text', pos: { x: 60, y: 60 }, size: { w: 220, h: 120 }, props: { text: '近日帖' }, createdAt: iso, updatedAt: iso }],
          updatedAt: iso,
        })
        tx.oncomplete = () => { db.close(); res(date) }
        tx.onerror = () => { db.close(); rej(tx.error) }
      }
      r.onerror = () => rej(r.error)
    })
  })
  const addCard = async (text) => {
    await page.click('.bj-add')
    await page.waitForSelector('textarea', { timeout: 4000 })
    await page.locator('textarea').first().fill(text)
    await page.mouse.click(6, 120) // 点空退编辑并结算（避开耳语/浮钮）
    await page.waitForTimeout(900)
  }
  await addCard('牵线甲')
  await addCard('牵线乙')
  const ids = await page.evaluate(() => {
    const of = (t) => [...document.querySelectorAll('.bj-card')].find((e) => (e.textContent || '').includes(t))?.getAttribute('data-card-id') ?? null
    return { a: of('牵线甲'), b: of('牵线乙'), other: of('撕下又想起') }
  })
  if (ids.a === null || ids.b === null) throw new Error('R7 夹具：桌上没有 牵线甲/乙')
  const tapCard = async (id) => {
    const p = await page.evaluate((i) => {
      const el = document.querySelector(`[data-card-id="${i}"]`)
      el.scrollIntoView({ block: 'center' })
      const r = el.getBoundingClientRect()
      return { x: r.x + 24, y: r.y + 14 }
    }, id)
    await page.mouse.click(p.x, p.y)
    await page.waitForTimeout(250)
  }
  await tapCard(ids.a)
  await page.click('[aria-label="卡片菜单"]')
  const menuHas = ((await page.locator(`.bj-menu-item:has-text("牵线")`).count()) === 1)
    && ((await page.locator(`.bj-menu-item:has-text("删除")`).count()) === 1)
  check('R7 D1 ⋯ 菜单有「牵线」（在删除之上）', menuHas)
  await page.click('.bj-menu-item:has-text("牵线")')
  await page.waitForTimeout(300)
  const dusk = await page.evaluate((s) => {
    const q = (i) => document.querySelector(`[data-card-id="${i}"]`)
    return {
      day: document.querySelector('.bj-day')?.getAttribute('data-linking') === 'true',
      canvas: document.querySelector('.bj-canvas')?.classList.contains('is-linking') === true,
      origin: q(s.a)?.getAttribute('data-link') === 'origin',
      lift: q(s.a)?.classList.contains('bj-link-origin') === true,
      target: q(s.b)?.getAttribute('data-link') === 'target',
      bar: document.querySelector('[data-linker]')?.textContent?.includes('牵给近日') === true,
    }
  }, ids)
  check('R7 D1 起牵：起点抬起、靶纸亮、招呼条带「牵给近日…」、画布入牵态', dusk.origin && dusk.lift && dusk.target && dusk.day && dusk.canvas && dusk.bar)
  await tapCard(ids.b)
  await page.waitForTimeout(900)
  const linked1 = await page.evaluate((s) => {
    const g = document.querySelector('g.bj-line')
    if (g === null) return { n: 0 }
    const ink = g.querySelector('.bj-line-ink')
    const d = ink?.getAttribute('d') ?? ''
    const m = /M (-?[\d.]+) (-?[\d.]+)/.exec(d)
    const ca = document.querySelector(`[data-card-id="${s.a}"]`)
    const r = ca.getBoundingClientRect()
    const canvas = document.querySelector('.bj-canvas').getBoundingClientRect()
    return { n: document.querySelectorAll('g.bj-line').length, ends: { x: Number(m?.[1]), y: Number(m?.[2]) }, center: { x: r.x - canvas.x + r.width / 2, y: r.y - canvas.y + r.height / 2 }, src: g.getAttribute('data-source'), tgt: g.getAttribute('data-target') }
  }, ids)
  check('R7 D2 点靶成线：SVG 贝塞尔存在、一端落在起点纸心（±4px）', linked1.n === 1 && Math.abs(linked1.ends.x - linked1.center.x) <= 4 && Math.abs(linked1.ends.y - linked1.center.y) <= 4)
  await page.reload()
  await page.waitForSelector('.bj-card')
  await page.waitForTimeout(900)
  const reloaded = await page.evaluate(() => ({ n: document.querySelectorAll('g.bj-line').length, hit: document.querySelectorAll('.bj-line-hit').length }))
  const e1 = await edgesDump()
  check('R7 reload 后线还在（边过缝落库、线随账重画）', reloaded.n === 1 && reloaded.hit === 1 && e1?.length === 1)
  // 牵线模式里的 dedup 目击：再来一次牵线，已连过的乙必须压暗（blocked），寻常纸仍旧可牵（不滥暗）
  await tapCard(ids.a)
  await page.click('[aria-label="卡片菜单"]')
  await page.click('.bj-menu-item:has-text("牵线")')
  await page.waitForTimeout(300)
  const dusk2 = await page.evaluate((s) => {
    const qb = document.querySelector(`[data-card-id="${s.b}"]`)
    const qo = document.querySelector(`[data-card-id="${s.other}"]`)
    return {
      linkedBlocked: qb?.getAttribute('data-link') === 'blocked' && qb?.classList.contains('bj-link-dim') === true,
      otherTarget: qo?.getAttribute('data-link') === 'target',
      origin: qb !== null && document.querySelector(`[data-card-id="${s.a}"]`)?.getAttribute('data-link') === 'origin',
    }
  }, ids)
  check('R7 D1 再牵见黄昏：已连过的纸压暗（dedup 可见），寻常纸仍可牵，起点抬起', dusk2.linkedBlocked && dusk2.otherTarget && dusk2.origin)
  await tapCard(ids.a) // 再点原纸收线
  await page.waitForTimeout(250)
  const receded = await page.evaluate(() => ({ day: document.querySelector('[data-linking]') !== null, canvas: document.querySelector('.bj-canvas')?.classList.contains('is-linking') === true }))
  check('R7 D1 再点原纸收线：牵态即刻退场', !receded.day && !receded.canvas)
  // 撕线：点线 → 签落线腰 → 点签 → 线没、账清、托盘不占
  await page.evaluate(() => {
    const path = document.querySelector('.bj-line-hit')
    const r = path.getBoundingClientRect()
    window.__r7mid = { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    path.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerId: 1, pointerType: 'mouse', isPrimary: true }))
  })
  await page.waitForSelector('.bj-line-chip', { timeout: 4000 })
  const chipTxt = ((await page.locator('.bj-line-chip').textContent()) || '').trim()
  await page.click('.bj-line-chip')
  await page.waitForTimeout(900)
  const afterTear = await page.evaluate(() => ({ n: document.querySelectorAll('g.bj-line').length, chip: document.querySelectorAll('.bj-line-chip').length, toast: document.querySelectorAll('.bj-toast').length }))
  check('R7 D3 点线请出「撕线」签；点签撕线：线没账清且不占托盘', chipTxt === '撕线' && afterTear.n === 0 && afterTear.chip === 0 && afterTear.toast === 0 && ((await edgesDump())?.length ?? -1) === 0)
  // 再牵回来（同一手势即反悔），然后跨日「牵给近日」
  await tapCard(ids.a)
  await page.click('[aria-label="卡片菜单"]')
  await page.click('.bj-menu-item:has-text("牵线")')
  await tapCard(ids.b)
  await page.waitForTimeout(900)
  await tapCard(ids.a)
  await page.click('[aria-label="卡片菜单"]')
  await page.click('.bj-menu-item:has-text("牵线")')
  await page.click('[data-linker] .bj-link-recent')
  await page.waitForSelector('.bj-link-modal [data-recent-row]', { timeout: 6000 })
  const sheet = await page.evaluate(() => {
    const row = document.querySelector('[data-recent-row]')
    return { n: document.querySelectorAll('[data-recent-row]').length, txt: row?.textContent ?? '', date: row?.getAttribute('data-day') ?? '' }
  })
  await page.click('.bj-link-modal [data-recent-row]')
  await page.waitForTimeout(900)
  const e2 = await edgesDump()
  check('R7 D1 「牵给近日」纸单列出昨日的纸；点中=跨日成线（库里两根，同日仍只画一根）', sheet.n >= 1 && sheet.txt.includes('近日帖') && sheet.date === prev && e2?.length === 2 && (await page.locator('g.bj-line').count()) === 1)
  // 撕端点卡 → 剪线；10s 反悔 → 卡与线同回、边 id 逐字
  const beforePrune = (await edgesDump()).map((e) => e.id)
  await tapCard(ids.b)
  await page.click('[aria-label="卡片菜单"]')
  await page.click('.bj-menu-item:has-text("删除")')
  await page.click('button:has-text("确认删除")')
  await page.waitForTimeout(900)
  const pruned = await edgesDump()
  const prunedOk = pruned?.length === 1 && pruned[0].source !== ids.b && pruned[0].target !== ids.b
  await page.click('.bj-toast .bj-toast-action') // 再想想：卡与线同批回位
  await page.waitForTimeout(1200)
  const revived = await edgesDump()
  const revivedIds = revived.map((e) => e.id).sort()
  const backB = await page.evaluate(() => [...document.querySelectorAll('.bj-card')].some((e) => (e.textContent || '').includes('牵线乙')))
  check('R7 D4 撕卡同批剪线；再想想卡与线逐字同回（edgePatches）', prunedOk && backB && JSON.stringify(revivedIds) === JSON.stringify(beforePrune.slice().sort()) && (await page.locator('g.bj-line').count()) === 1)
  await page.screenshot({ path: `${SHOTS}/25-links.png`, fullPage: true })
  // 线模式：选中甲 → 切「线」→ 串珠（锚居首、昨日内层、日期墨印）→ 点珠翻页并回卡片模式
  await tapCard(ids.a)
  await page.click('[data-mode="thread"]')
  await page.waitForSelector('[data-thread-strip]', { timeout: 6000 })
  const beads = await page.evaluate((s) => {
    const nodes = [...document.querySelectorAll('[data-thread-node]')]
    return { order: nodes.map((n) => ({ a: n.getAttribute('data-thread-node') === s.a, prev: n.getAttribute('data-thread-node') === 'r7-yesterday' })), days: [...document.querySelectorAll('[data-thread-day]')].length, segs: document.querySelectorAll('.bj-thread-seg').length }
  }, ids)
  check('R7 D5 线模式：锚点居首、昨日的纸入串、日期墨印分隔、珠间直线段', beads.order.length === 3 && beads.order[0].a === true && beads.order.some((o) => o.prev) && beads.days >= 1 && beads.segs >= 2)
  await page.screenshot({ path: `${SHOTS}/26-thread.png`, fullPage: true })
  await page.click('[data-thread-node="r7-yesterday"]')
  await page.waitForTimeout(900)
  const movedDay = await page.evaluate(() => ({
    hash: window.location.hash,
    thread: document.querySelector('[data-thread]') !== null,
    note: [...document.querySelectorAll('.bj-card')].some((e) => (e.textContent || '').includes('近日帖')),
  }))
  check('R7 D5 点珠：回卡片模式并翻开那一天', movedDay.hash === `#/d/${prev}` && !movedDay.thread && movedDay.note)
  await page.click('.bj-back')
  await page.waitForSelector('.bj-cell')
  // D6 归档往返：导出→wipe→导入→线随账回魂、边逐字
  await page.click('button[aria-label="设置"]')
  await page.waitForTimeout(300)
  const dlR7 = page.waitForEvent('download', { timeout: 15000 })
  await page.getByRole('button', { name: /导出/ }).click()
  await (await dlR7).saveAs(join(HERE, 'relations.banjizip'))
  await page.waitForTimeout(500)
  await page.evaluate(() => new Promise((res) => {
    const r = indexedDB.deleteDatabase('banji-journal')
    r.onsuccess = r.onerror = r.onblocked = () => res()
  }))
  await page.goto(BASE)
  await page.waitForSelector('.bj-cell')
  await page.click('button[aria-label="设置"]')
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: /导入/ }).click()
  await page.setInputFiles('input.bj-hidden-file', join(HERE, 'relations.banjizip'))
  await page.waitForSelector('button:has-text("继续")', { timeout: 8000 })
  await page.click('button:has-text("继续")')
  await page.waitForSelector('button:has-text("确认替换")', { timeout: 4000 })
  await page.click('button:has-text("确认替换")')
  await page.waitForTimeout(3000)
  const backR7 = await edgesDump()
  check('R7 D6 归档往返：edges.json 逐字回魂（id/端点/时间戳不重生）', JSON.stringify((backR7 ?? []).map((e) => e.id).sort()) === JSON.stringify(beforePrune.slice().sort()))
  await page.reload()
  await page.waitForSelector('.bj-cell')
  await page.click(`.bj-cell[data-date="${today}"]`)
  await page.waitForSelector('.bj-card')
  await page.waitForTimeout(900)
  check('R7 D6 导入后开日：同日连线重新画上', (await page.locator('g.bj-line').count()) === 1)
}

await page.click('.bj-back')
await page.waitForSelector('.bj-cell')

// —— R8 跨时间探索（桌面全程）：3 天底料（直写 IDB 契约形状，与前日一根跨日线）→
//    放大镜开纸片（持焦+空语耳语）→ CJK 搜索按日分组新日在前+赭底高亮 → 行点=跳那天卡片模式暖脉冲（到点熄、键集⊆契约）→
//    ⌘F/Esc → 图模式：全日记纸片+跨日发丝线 → 点异日 chip 翻回卡片模式。
{
  const twoDays = await page.evaluate(() => {
    const d = new Date()
    d.setDate(d.getDate() - 2)
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
  })
  await page.evaluate(([td]) => new Promise((res, rej) => {
    const iso = new Date().toISOString()
    const r = indexedDB.open('banji-journal')
    r.onsuccess = () => {
      const db = r.result
      const tx = db.transaction(['journals', 'edges'], 'readwrite')
      tx.objectStore('journals').put({ date: td, cards: [{ id: 'r8-old-day', kind: 'text', pos: { x: 60, y: 60 }, size: { w: 220, h: 120 }, props: { text: '前日槐花帖' }, createdAt: iso, updatedAt: iso }], updatedAt: iso })
      tx.objectStore('edges').put({ id: 'r8-cross-old', source: 'r8-old-day', target: 'r7-yesterday', createdAt: iso, updatedAt: iso })
      tx.oncomplete = () => { db.close(); res() }
      tx.onerror = () => { db.close(); rej(tx.error) }
    }
    r.onerror = () => rej(r.error)
  }), [twoDays])

  const mag = page.locator('button[aria-label="搜索手札"]')
  check('R8 D1 放大镜居月历页眉齿轮之旁', (await mag.count()) === 1 && await mag.isVisible())
  await mag.click()
  await page.waitForSelector('[data-search-sheet]', { timeout: 4000 })
  const openInfo = await page.evaluate(() => ({
    focused: document.activeElement?.getAttribute('aria-label') ?? '',
    whisper: document.querySelector('.bj-search-whisper')?.textContent ?? '',
  }))
  check('R8 D1 纸片自下升起、输入即持焦、空查询耳语「想找哪一笔？」', openInfo.focused === '搜索笔记' && openInfo.whisper === '想找哪一笔？')
  await page.fill('.bj-search-input', '槐花')
  await page.waitForFunction(() => document.querySelectorAll('[data-search-row]').length >= 2, null, { timeout: 8000 })
  const grouped = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-search-row]')]
    const dates = rows.map((r) => r.getAttribute('data-search-date') ?? '')
    const uniq = [...new Set(dates)]
    return { n: rows.length, uniq, hl: document.querySelectorAll('.bj-search-hl').length, tag: rows[0]?.querySelector('.bj-search-day')?.textContent ?? '' }
  })
  const newestFirst = grouped.uniq.every((d, i) => i === 0 || grouped.uniq[i - 1] >= d)
  check('R8 D1 CJK 搜索按日分组·新日在前·每行日期书口签+赭底高亮 span', grouped.n === 2 && newestFirst && grouped.uniq.includes(today) && grouped.uniq.includes(twoDays) && grouped.hl >= 2 && grouped.tag.includes('月'))
  const dNow = await dump(page)
  const flatNow = dNow.journals.flatMap((j) => j.cards)
  const matNow = flatNow.find((c) => Array.isArray(c.children) && c.children.length > 0)
  const kidNow = matNow === undefined ? undefined : dNow.journals.flatMap((j) => j.cards).find((c) => c.id === matNow.children[0])
  if (matNow === undefined || kidNow === undefined || !(kidNow.text || '').trim()) throw new Error('R8 夹具：今日没有可测的收编孩子纸（容器 children 缺文本）')
  await page.fill('.bj-search-input', kidNow.text.trim().slice(0, 3))
  const kidRowFound = await page
    .waitForFunction((k) => [...document.querySelectorAll('[data-search-row]')].some((r) => r.getAttribute('data-search-card') === k), kidNow.id, { timeout: 8000 })
    .then(() => true)
    .catch(() => false)
  check('R8 D2 容器孩子自成一行（行指向孩子而非垫纸）', kidRowFound === true && kidNow.id !== matNow.id)
  const dropAsset = dNow.assets.find((a) => a.name === '拖入.png')
  if (dropAsset === undefined) throw new Error('R8 夹具：库里没有名为 拖入.png 的资产（R2 拖放纸没到底料里？）')
  const dropCard = flatNow.find((c) => c.hash === dropAsset.hash)
  if (dropCard === undefined) throw new Error('R8 夹具：没有引用 拖入.png 的图/文件卡')
  // 每次输入都等「这一问自己的行」出现再断言：250ms debounce 窗里旧行不作数。
  await page.fill('.bj-search-input', '拖入')
  const assetRowOk = await page
    .waitForFunction((id) => [...document.querySelectorAll('[data-search-row]')].some((r) => r.getAttribute('data-search-card') === id && (r.textContent || '').includes('拖入')), dropCard.id, { timeout: 8000 })
    .then(() => true)
    .catch(() => false)
  const assetRowN = await page.evaluate(() => document.querySelectorAll('[data-search-row]').length)
  check('R8 D2 附件名经 hash 联结入语料（「拖入」只中那张拖入.png 的图卡）', assetRowOk && assetRowN === 1)
  await page.fill('.bj-search-input', '前日')
  await page.waitForFunction((td) => document.querySelector(`[data-search-row][data-search-date="${td}"]`) !== null, twoDays, { timeout: 8000 })
  await page.click(`[data-search-row][data-search-date="${twoDays}"]`)
  const landed0 = await page.waitForFunction(() => {
    const card = document.querySelector('[data-card-id="r8-old-day"]')
    return card !== null && card.classList.contains('is-pulse')
  }, null, { timeout: 2500 }).then(() => true).catch(() => false)
  const landed = await page.evaluate(() => ({
    hash: window.location.hash,
    sheetGone: document.querySelector('[data-search-sheet]') === null,
    canvas: document.querySelector('.bj-canvas') !== null,
    graph: document.querySelector('[data-graph]') !== null,
  }))
  check('R8 D1 行点=跳那天的卡片模式：目标纸暖脉冲点亮、纸片退场、不残图/线视图', landed.hash === `#/d/${twoDays}` && landed.sheetGone && landed.canvas && !landed.graph && landed0)
  const pulseGone = await page.waitForFunction(() => {
    const card = document.querySelector('[data-card-id="r8-old-day"]')
    return card === null || !card.classList.contains('is-pulse')
  }, null, { timeout: 3000 }).then(() => true).catch(() => false)
  check('R8 D4 脉冲是瞬态：到点即熄（不留描边余烧）', pulseGone)
  const keyleak8 = await page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('banji-journal')
    r.onsuccess = () => {
      const db = r.result
      const tx = db.transaction(['journals', 'edges'], 'readonly')
      let cardsBad = false
      let edgesBad = false
      tx.objectStore('journals').getAll().onsuccess = (e) => {
        const keys = ['id', 'kind', 'pos', 'size', 'z', 'rot', 'children', 'meta', 'props', 'createdAt', 'updatedAt']
        cardsBad = e.target.result.some((d) => d.cards.some((c) => Object.keys(c).some((k) => !keys.includes(k))))
        tx.objectStore('edges').getAll().onsuccess = (e2) => {
          db.close()
          const ek = ['id', 'source', 'target', 'role', 'createdAt', 'updatedAt']
          edgesBad = e2.target.result.some((x) => Object.keys(x).some((k) => !ek.includes(k)))
        }
      }
      tx.onerror = () => res(true)
      tx.oncomplete = () => res(cardsBad || edgesBad)
    }
    r.onerror = () => res(true)
  }))
  check('R8 D4 键集纪律（搜索跳转历遍后）：卡片与边键 ⊆ 契约字段全集', keyleak8 === false)
  await page.click('.bj-back')
  await page.waitForSelector('.bj-cell')
  await page.keyboard.press('Control+f')
  await page.waitForSelector('[data-search-sheet]', { timeout: 3000 })
  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-search-sheet]', { state: 'detached', timeout: 3000 })
  check('R8 D1 ⌘F/Ctrl+F 开纸、Esc 退场（桌面键位）', true)
  await page.click(`.bj-cell[data-date="${today}"]`)
  await page.waitForSelector('.bj-card')
  await page.click('.bj-mode-seg-btn:has-text("图")')
  await page.waitForSelector('[data-graph-field]', { timeout: 6000 })
  const graph = await page.evaluate(() => ({
    chips: document.querySelectorAll('[data-graph-chip]').length,
    cols: [...document.querySelectorAll('[data-graph-col]')].map((c) => c.getAttribute('data-graph-col') ?? ''),
    oldLine: document.querySelector('[data-graph-line="r8-old-day→r7-yesterday"]') !== null,
  }))
  const chronoOk = graph.cols.every((c, i) => i === 0 || graph.cols[i - 1] <= c)
  const colSet = new Set(graph.cols)
  check('R8 D3 图模式：全日记纸片排上时间轴、日期列历法升序、跨日发丝贝塞尔在', graph.chips >= 8 && chronoOk && colSet.has(today) && colSet.has(twoDays) && graph.oldLine)
  await page.screenshot({ path: `${SHOTS}/28-graph.png`, fullPage: true })
  await page.click('[data-graph-chip="r8-old-day"]')
  const chipPulsed = await page.waitForFunction(() => {
    const card = document.querySelector('[data-card-id="r8-old-day"]')
    return card !== null && card.classList.contains('is-pulse')
  }, null, { timeout: 2500 }).then(() => true).catch(() => false)
  const chipJump = await page.evaluate(() => ({
    hash: window.location.hash,
    canvas: document.querySelector('.bj-canvas') !== null,
    graphGone: document.querySelector('[data-graph]') === null,
  }))
  check('R8 D3 点异日 chip：退图模式、翻回那天的卡片并脉冲那张纸', chipJump.hash === `#/d/${twoDays}` && chipJump.canvas && chipJump.graphGone && chipPulsed)
  await page.click('.bj-mode-seg-btn:has-text("图")')
  await page.waitForSelector('[data-graph]', { timeout: 4000 })
  await page.click('.bj-mode-seg-btn:has-text("卡片")')
  await page.waitForSelector('.bj-canvas', { timeout: 4000 })
  check('R8 D3 三段目光可来回：图↔卡片换到纸面如常', (await page.locator('.bj-card').count()) >= 1)
}

// —— R9 卡型补齐（桌面全程）：真 WAV 字节→声音纸（原生控件真解码）→ 真 PDF 字节→火漆签
//    （新页翻开 blob:）→ canvas+MediaRecorder 真 webm→影纸 → 种类纸单（代码/链接落纸+javascript: 耳语拒签）
//    → 重命名此纸：props.name 覆盖过缝、asset 记录不沾、同哈希两纸各显其名 → 导出→wipe→重导入名随身走。
{
  await page.click('.bj-back')
  await page.waitForSelector('.bj-cell')
  await page.click(`.bj-cell[data-date="${today}"]`)
  await page.waitForSelector('.bj-card')
  await page.waitForTimeout(900) // 等旧 blob chip 出名、settle 动画熄灭，再动纸
  // 真 IDB 落库等待器：乐观 DOM 不作数（R6 e2e 纪律原文照办）。
  const waitFor = async (fn, timeoutMs = 12000) => {
    const t0 = Date.now()
    for (;;) {
      if (await fn()) return true
      if (Date.now() - t0 > timeoutMs) return false
      await page.waitForTimeout(250)
    }
  }
  const cardsNow = async () => (await dump(page)).journals.flatMap((j) => j.cards)

  // 1) 真 RIFF/WAVE：8-bit 单声道 220Hz 半秒——chromium 能真解码，readyState≥1 是硬证。
  const wav = (() => {
    const rate = 8000
    const n = 4000
    const data = Buffer.alloc(n)
    for (let i = 0; i < n; i++) data[i] = 128 + Math.round(40 * Math.sin((2 * Math.PI * 220 * i) / rate))
    const head = Buffer.alloc(44)
    head.write('RIFF', 0); head.writeUInt32LE(36 + n, 4); head.write('WAVE', 8)
    head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22)
    head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate, 28); head.writeUInt16LE(1, 32); head.writeUInt16LE(8, 34)
    head.write('data', 36); head.writeUInt32LE(n, 40)
    return Buffer.concat([head, data])
  })()
  const wavHash = createHash('sha256').update(wav).digest('hex')
  await page.setInputFiles('input[aria-label="夹带"]', { name: '晨曲.wav', mimeType: 'audio/wav', buffer: wav })
  await page.waitForSelector('.bj-card.be-audio audio.bj-audio[controls]', { timeout: 8000 })
  const audioDecoded = await waitFor(() => page.evaluate(() => {
    const a = document.querySelector('.bj-card.be-audio audio.bj-audio')
    return a !== null && a.readyState >= 1
  }))
  const wavInStore = await waitFor(async () => {
    const d = await dump(page)
    return d.journals.flatMap((j) => j.cards).some((c) => c.kind === 'audio' && c.hash === wavHash) && d.assets.some((a) => a.hash === wavHash && a.name === '晨曲.wav')
  })
  check('R9·D1+D2 真 WAV 夹带 → routeAttach 落声音纸、<audio controls> 真解码 (readyState≥1)、过缝落库', audioDecoded && wavInStore)

  // 2) 最小真 PDF（%PDF-1.4 一页、xref 偏移实算）：火漆签在新页翻开 blob: 原件。
  const pdf = (() => {
    const stream = 'BT /F1 16 Tf 18 60 Td (BanJi R9 PDF) Tj ET'
    const objs = [
      '<</Type/Catalog/Pages 2 0 R>>',
      '<</Type/Pages/Kids[3 0 R]/Count 1>>',
      '<</Type/Page/Parent 2 0 R/MediaBox[0 0 210 120]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
      `<</Length ${String(stream.length)}>>\nstream\n${stream}\nendstream`,
      '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
    ]
    let out = '%PDF-1.4\n'
    const offs = []
    objs.forEach((o, i) => {
      offs.push(out.length)
      out += `${String(i + 1)} 0 obj\n${o}\nendobj\n`
    })
    const xref = out.length
    out += `xref\n0 ${String(objs.length + 1)}\n0000000000 65535 f \n`
    for (const off of offs) out += `${String(off).padStart(10, '0')} 00000 n \n`
    out += `trailer\n<</Size ${String(objs.length + 1)}/Root 1 0 R>>\nstartxref\n${String(xref)}\n%%EOF\n`
    return Buffer.from(out, 'latin1')
  })()
  await page.setInputFiles('input[aria-label="夹带"]', { name: '契约.pdf', mimeType: 'application/pdf', buffer: pdf })
  await page.waitForSelector('a[data-pdf-open][target="_blank"]', { timeout: 8000 })
  const sealAttrs = await page.evaluate(() => {
    const a = document.querySelector('a[data-pdf-open]')
    return { blank: a?.target === '_blank', noopener: (a?.getAttribute('rel') ?? '').split(' ').includes('noopener'), blob: (a?.getAttribute('href') ?? '').startsWith('blob:') }
  })
  // headless chromium 对 blob PDF 走下载管线（viewer 缺席）：新页必开；原件字节以
  // 「uuid.pdf」交还——扩展名由 blob 真 MIME 推出，即 proof-of-pdf。有真 viewer 的环境则新页 URL 落成 blob:。
  const popupP = page.waitForEvent('popup', { timeout: 8000 })
  const mainDlP = page.waitForEvent('download', { timeout: 8000 }).catch(() => null)
  await page.click('a[data-pdf-open]')
  let pdfOpened = false
  let pdfUrl = ''
  try {
    const popup = await popupP
    pdfUrl = popup.url()
    const popDl = await popup.waitForEvent('download', { timeout: 2000 }).catch(() => null)
    const mainDl = await mainDlP
    const dl = popDl ?? mainDl
    const viaDownload = dl !== null && dl.suggestedFilename().endsWith('.pdf')
    const viaViewer = viaDownload ? false : await popup.waitForURL((u) => u.href.startsWith('blob:'), { timeout: 4000 }).then(() => true).catch(() => false)
    pdfOpened = viaDownload || viaViewer
    await popup.close().catch(() => undefined)
  } catch { pdfUrl = '(no popup)' }
  check(`R9·D2 火漆签 _blank+noopener、翻开 = 新页接住真 PDF 原件（${pdfUrl.slice(0, 24) || 'download-route'}）`, sealAttrs.blank && sealAttrs.noopener && sealAttrs.blob && pdfOpened)

  // 3) 真 webm（页内 canvas.captureStream + MediaRecorder 录 400ms——字节真解码，probe 走线上路）。
  const webmB64 = await page.evaluate(async () => {
    const cv = document.createElement('canvas')
    cv.width = 320
    cv.height = 200
    const g = cv.getContext('2d')
    const stream = cv.captureStream(25)
    const rec = new MediaRecorder(stream, { mimeType: 'video/webm' })
    const chunks = []
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
    const done = new Promise((res) => { rec.onstop = () => res() })
    rec.start()
    const t0 = performance.now()
    for (let i = 0; i < 10; i++) {
      g.fillStyle = `hsl(${String(i * 30)} 40% 72%)`
      g.fillRect(0, 0, 320, 200)
      await new Promise((r) => setTimeout(r, 40))
    }
    g.fillStyle = '#00000022'; g.fillRect(60, 40, 200, 120)
    rec.stop()
    await done
    void t0
    const blob = new Blob(chunks, { type: 'video/webm' })
    const buf = await blob.arrayBuffer()
    return btoa(String.fromCharCode(...new Uint8Array(buf)))
  })
  const webm = Buffer.from(webmB64, 'base64')
  await page.setInputFiles('input[aria-label="夹带"]', { name: '庭院短片.webm', mimeType: 'video/webm', buffer: webm })
  const videoUp = await waitFor(() => page.evaluate(() => {
    const v = document.querySelector('.bj-card.be-video video.bj-video[controls]')
    return v !== null && v.readyState >= 1
  }))
  // webm 可能探测失败退默认 320x208 —— 两条路都收：只要影纸在案且 w≤420 封顶即可。
  const videoSized = await waitFor(async () => {
    const c = (await cardsNow()).find((x) => x.kind === 'video')
    return c !== undefined && c.hash !== undefined
  })
  check('R9·D1+D2 真 webm 夹带 → 影纸 (video controls 真解码 readyState≥1)、过缝落库', videoUp && videoSized)

  // 4) 种类纸单：代码 → 打字 → reload 仍在。
  await page.click('[aria-label="添一张卡·种类"]')
  await page.waitForSelector('[data-kind-sheet]', { timeout: 4000 })
  const rows = await page.evaluate(() => [...document.querySelectorAll('[data-kind-row]')].map((b) => (b.textContent ?? '').trim()))
  await page.click('[data-kind-row="代码"]')
  await page.waitForSelector('[data-code-edit]', { timeout: 4000 })
  await page.fill('[data-code-edit]', 'fn 落纸() {\n  println("R9");\n}')
  await page.mouse.click(6, 120)
  const codePersist = await waitFor(async () => (await cardsNow()).some((c) => c.kind === 'code' && (c.text ?? '').includes('R9')))
  await page.reload()
  await page.waitForSelector('.bj-card')
  const codeBack = await page.evaluate(() => document.querySelector('pre[data-code-view]')?.textContent?.includes('fn 落纸()') ?? false)
  check(`R9·D3 纸单五路齐 (${rows.join('/')})；代码纸打字过缝、reload 原样排 pre`, rows.join('') === '正文手记代码链接垫纸' && codePersist && codeBack)

  // 5) 纸单·链接：javascript: 拒签 + 耳语；合格串渲染成题签（无一条脏 href 上纸）。
  await page.click('[aria-label="添一张卡·种类"]')
  await page.waitForSelector('[data-kind-sheet]', { timeout: 4000 })
  await page.click('[data-kind-row="链接"]')
  await page.waitForSelector('[data-link-field]', { timeout: 4000 })
  await page.fill('[data-link-field]', 'javascript:alert(document.domain)')
  await page.keyboard.press('Enter')
  const whisper = await page.waitForSelector('.bj-toast:has-text("写个完整网址")', { timeout: 4000 }).then(() => true).catch(() => false)
  const stillEditing = await page.evaluate(() => document.querySelector('[data-link-field]') !== null)
  await page.fill('[data-link-field]', 'https://example.com/r9')
  await page.keyboard.press('Enter')
  const linkOk = await waitFor(() => page.evaluate(() => {
    const a = document.querySelector('.bj-card.be-link a.bj-link-hair')
    return a !== null && a.href === 'https://example.com/r9' && a.target === '_blank' && (a.getAttribute('rel') ?? '').includes('noopener')
  }))
  const noDirty = await page.evaluate(() => ![...document.querySelectorAll('a[href^="javascript"]')].length)
  const linkInStore = await waitFor(async () => (await cardsNow()).some((c) => c.kind === 'link' && c.url === 'https://example.com/r9'))
  check('R9·D3+D2 链接纸：javascript: 拒签配耳语仍在编辑、https 题签上纸过缝、全页零脏 href', whisper && stillEditing && linkOk && noDirty && linkInStore)

  // 6) 重命名此纸（D6 债销账·桌面）：给 clip.png 图纸题「雨后槐花」，再夹同一字节题「同名副本」。
  const dPre = await dump(page)
  const clipAsset = dPre.assets.find((a) => a.name === 'clip.png')
  if (clipAsset === undefined) throw new Error('R9 夹具：库里没有 clip.png 资产')
  const clipCard = dPre.journals.flatMap((j) => j.cards).find((c) => c.kind === 'image' && c.hash === clipAsset.hash)
  if (clipCard === undefined) throw new Error('R9 夹具：没有引用 clip.png 的图纸')
  const renameViaUI = async (cardId, name) => {
    const p = await page.evaluate((i) => {
      const el = document.querySelector(`[data-card-id="${i}"]`)
      if (el === null) throw new Error(`债夹具：[${i}] 不在纸上 — hash=${location.hash} canvas=${document.querySelector('.bj-canvas') !== null} cards=${[...document.querySelectorAll('[data-card-id]')].map((e) => `${e.getAttribute('data-card-id')}:${String(e.className.match(/be-\S+/)?.[0])}`).join(',')}`)
      el.scrollIntoView({ block: 'center' })
      const r = el.getBoundingClientRect()
      return { x: r.x + 24, y: r.y + 14 }
    }, cardId)
    await page.mouse.click(p.x, p.y)
    await page.waitForTimeout(300)
    await page.click('[aria-label="卡片菜单"]')
    await page.click('[data-menu-rename]')
    await page.fill('[data-rename-input]', name)
    await page.click('[data-rename-commit]')
    await page.waitForTimeout(900)
  }
  await renameViaUI(clipCard.id, '雨后槐花')
  const renamed1 = await waitFor(async () => {
    const c = (await cardsNow()).find((x) => x.id === clipCard.id)
    return c?.name === '雨后槐花'
  })
  const assetUntouched = (await dump(page)).assets.find((a) => a.hash === clipAsset.hash)?.name === 'clip.png'
  await page.setInputFiles('input[aria-label="夹带"]', pngClip) // 同字节第二夹：内容寻址去重，资产一条
  const twinAppeared = await waitFor(async () => {
    const imgs = (await dump(page)).journals.flatMap((j) => j.cards).filter((c) => c.kind === 'image' && c.hash === clipAsset.hash)
    return imgs.some((c) => c.name !== '雨后槐花')
  })
  const twin = (await cardsNow()).find((c) => c.kind === 'image' && c.hash === clipAsset.hash && c.name !== '雨后槐花')
  if (!twinAppeared || twin === undefined) throw new Error('R9 夹具：同字节第二张图纸没落纸')
  await renameViaUI(twin.id, '同名副本')
  await page.reload()
  await page.waitForSelector('.bj-card')
  await page.waitForTimeout(800)
  const twinLabels = await page.evaluate(() => [...document.querySelectorAll('.bj-card.be-image .bj-img-name')].map((p) => p.textContent?.trim() ?? ''))
  const dTwin = await dump(page)
  const sameHash = dTwin.journals.flatMap((j) => j.cards).filter((c) => c.kind === 'image' && c.hash === clipAsset.hash)
  const clipAssets = dTwin.assets.filter((a) => a.hash === clipAsset.hash)
  check('R9·D6 债死：同哈希两图纸各题各名（雨后槐花/同名副本同屏互见）、asset 单条原名不沾', renamed1 && assetUntouched && twinLabels.includes('雨后槐花') && twinLabels.includes('同名副本') && sameHash.length === 2 && clipAssets.length === 1 && clipAssets[0].name === 'clip.png')

  // 7) 名随纸走：导出→wipe→重导入，覆盖名逐字回魂（props.name 只是 JSON，零迁移兑现）。
  const dR1 = await dump(page)
  await page.click('.bj-day-head [aria-label="设置"]')
  await page.waitForTimeout(300)
  const dlR9 = page.waitForEvent('download', { timeout: 15000 })
  await page.getByRole('button', { name: /导出/ }).click()
  await (await dlR9).saveAs(join(HERE, 'kinds.banjizip'))
  await page.waitForTimeout(500)
  await page.evaluate(() => new Promise((res) => {
    const r = indexedDB.deleteDatabase('banji-journal')
    r.onsuccess = r.onerror = r.onblocked = () => res()
  }))
  await page.goto(BASE)
  await page.waitForSelector('.bj-cell')
  await page.click('button[aria-label="设置"]')
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: /导入/ }).click()
  await page.setInputFiles('input.bj-hidden-file', join(HERE, 'kinds.banjizip'))
  await page.waitForSelector('button:has-text("继续")', { timeout: 8000 })
  await page.click('button:has-text("继续")')
  await page.waitForSelector('button:has-text("确认替换")', { timeout: 4000 })
  await page.click('button:has-text("确认替换")')
  await page.waitForTimeout(3000)
  await page.reload()
  await page.waitForSelector('.bj-cell')
  await page.click(`.bj-cell[data-date="${today}"]`)
  await page.waitForSelector('.bj-card')
  const dR2 = await dump(page)
  const namesBack = dR2.journals.flatMap((j) => j.cards).filter((c) => c.name !== null).map((c) => c.name).sort()
  const keyleak9 = await page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('banji-journal')
    r.onsuccess = () => {
      const db = r.result
      const tx = db.transaction('journals', 'readonly')
      tx.objectStore('journals').getAll().onsuccess = (e) => {
        db.close()
        const keys = ['id', 'kind', 'pos', 'size', 'z', 'rot', 'children', 'meta', 'props', 'createdAt', 'updatedAt']
        res(e.target.result.some((d) => d.cards.some((c) => Object.keys(c).some((k) => !keys.includes(k)))))
      }
      tx.onerror = () => res(true)
    }
    r.onerror = () => res(true)
  }))
  check('R9·D6+D4 导出→wipe→重导入：改名纸的 props.name 逐字回魂（覆盖名随身走），键集 ⊆ 契约字段照样过秤', JSON.stringify(namesBack) === '["同名副本","雨后槐花"]' && keyleak9 === false)
}

// —— R11·D5 快捷键补全（真键盘过浏览器）：⌘N 添卡即聚焦编辑 / ⌘⇧K 造叠 / ⌘E 抽屉直发导出（键术单在场）/ Esc 合上抽屉。
// —— R11·D2 题签对称：四型资产卡同名元素同 class（.bj-asset-name），改名后 reload 各显纸面名。
{
  const poll = async (fn, timeoutMs = 12000) => {
    const t0 = Date.now()
    for (;;) {
      if (await fn()) return true
      if (Date.now() - t0 > timeoutMs) return false
      await page.waitForTimeout(250)
    }
  }
  const cardsNow = async () => (await dump(page)).journals.flatMap((j) => j.cards)
  await page.click('.bj-back')
  await page.waitForSelector('.bj-cell')
  await page.click(`.bj-cell[data-date="${today}"]`)
  await page.waitForSelector('.bj-card')
  await page.waitForTimeout(900)

  await page.keyboard.press('Control+e')
  const dlR11 = await page.waitForEvent('download', { timeout: 15000 }).catch(() => null)
  const drawerUp = await page.evaluate(() => document.querySelector('.bj-drawer') !== null)
  const keyRows = await page.evaluate(() => document.querySelectorAll('[data-keylist] li').length)
  check('R11·D5 ⌘E：抽屉开门直发导出（只读零确认）+ 键术五行在场', dlR11 !== null && drawerUp === true && keyRows === 5)
  await page.keyboard.press('Escape')
  check('R11·D5 Esc 合上抽屉（巡检补的门：纸片/纸单/牵线早有出口，抽屉是漏下的最后一扇）', (await page.locator('.bj-drawer').count()) === 0)

  const cardsBeforeN = (await cardsNow()).length
  await page.keyboard.press('Control+n')
  const taFocused = await poll(() => page.evaluate(() => document.activeElement?.tagName === 'TEXTAREA'))
  await page.evaluate(() => document.activeElement?.blur())
  const nSaved = await poll(async () => (await cardsNow()).length >= cardsBeforeN + 1)
  check('R11·D5 ⌘N = 添一张卡：与同一枚 pill 同口径（新纸即持焦编辑、过缝落库）', taFocused && nSaved)

  const kMat0 = await page.evaluate(() => document.querySelectorAll('.bj-card.be-container').length)
  await page.keyboard.press('Control+Shift+k')
  const kMatOn = await poll(() => page.evaluate((n) => document.querySelectorAll('.bj-card.be-container').length > n, kMat0))
  check('R11·D5 ⌘⇧K = 造叠：垫纸即刻上纸', kMatOn === true)

  // D2 夹具：给影纸/火漆各题一名，再夹一枚 .txt（text/plain→文件型）题一名；图纸 R9 已题「雨后槐花」。
  // chip 体是 data-nodrag（点它不选卡——R4 触摸修复的既有纪律），落点走卡片 12/14px 留白纸边。
  const renameOn = async (cardId, name) => {
    const p = await page.evaluate((i) => {
      const el = document.querySelector(`[data-card-id="${i}"]`)
      if (el === null) return null
      el.scrollIntoView({ block: 'center' })
      const r = el.getBoundingClientRect()
      return { x: r.x + 6, y: r.y + 6 }
    }, cardId)
    if (p === null) return false
    await page.mouse.click(p.x, p.y)
    await page.waitForTimeout(300)
    await page.click('[aria-label="卡片菜单"]')
    await page.click('[data-menu-rename]')
    await page.fill('[data-rename-input]', name)
    await page.click('[data-rename-commit]')
    return poll(async () => (await cardsNow()).find((c) => c.id === cardId)?.name === name)
  }
  const dPre11 = await dump(page)
  const vidCard = dPre11.journals.flatMap((j) => j.cards).find((c) => c.kind === 'video')
  const pdfCard = dPre11.journals.flatMap((j) => j.cards).find((c) => c.kind === 'pdf')
  if (vidCard === undefined || pdfCard === undefined) throw new Error('R11·D2 夹具：影纸/火漆不在纸上')
  const rnVid = await renameOn(vidCard.id, '影纸题雪')
  const rnPdf = await renameOn(pdfCard.id, '火漆题卷')
  await page.setInputFiles('input[aria-label="夹带"]', { name: '山门.txt', mimeType: 'text/plain', buffer: Buffer.from('山门一入 深似海\n', 'utf8') })
  await page.waitForSelector('.bj-card.be-file', { timeout: 8000 })
  const dMid = await dump(page)
  const fileCard = dMid.journals.flatMap((j) => j.cards).find((c) => c.kind === 'file')
  if (fileCard === undefined) throw new Error('R11·D2 夹具：文件卡没落纸（mime 路由坏了？）')
  const rnFile = await renameOn(fileCard.id, '山门题记')
  await page.reload()
  await page.waitForSelector('.bj-card')
  await page.waitForTimeout(1200) // 等 asset 出 blob（常挂口径下未改名显资产原名，改名纸显覆盖名）
  const d2 = await page.evaluate(() => {
    const one = (sel) => document.querySelector(sel)?.textContent?.trim() ?? null
    const all = (sel) => [...document.querySelectorAll(sel)].map((e) => e.textContent?.trim() ?? '')
    const classes = ['.bj-card.be-image .bj-asset-name', '.bj-card.be-video .bj-asset-name', '.bj-card.be-pdf .bj-asset-name', '.bj-card.be-file .bj-asset-name']
    return {
      image: all('.bj-card.be-image .bj-asset-name').includes('雨后槐花'),
      video: one('.bj-card.be-video .bj-card-body .bj-video-name') === '影纸题雪',
      pdf: one('.bj-card.be-pdf .bj-card-body .bj-file-name') === '火漆题卷',
      file: one('.bj-card.be-file .bj-card-body .bj-file-name') === '山门题记',
      allOneClass: classes.every((c) => [...document.querySelectorAll(c)].every((e) => e.classList.contains('bj-asset-name') && e.hasAttribute('data-asset-name'))) && classes.every((c) => document.querySelector(c) !== null),
    }
  })
  const named = d2.image && d2.video && d2.pdf && d2.file
  check('R11·D2 题签对称：改名过缝 reload 四型各显纸面名（图/影/火漆/文件）', rnVid && rnPdf && rnFile && named)
  check('R11·D2 同一 class 纪律：四型 name 元素全戴 .bj-asset-name + data-asset-name（题签是排印纪律不是各写各的）', d2.allOneClass === true)
}

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

// —— R8 夜读取证：搜索纸片与图模式纸片在夜读令牌下同读（机判深底浅字，观感由截图背书）——
await page.click('.bj-back')
await page.waitForSelector('.bj-cell')
await page.click('button[aria-label="搜索手札"]')
await page.waitForSelector('[data-search-sheet]', { timeout: 4000 })
await page.fill('.bj-search-input', '槐花')
await page.waitForFunction(() => document.querySelectorAll('[data-search-row]').length >= 2, null, { timeout: 8000 })
const nightSearch = await page.evaluate(() => {
  const cs = getComputedStyle(document.querySelector('[data-search-sheet]'))
  const row = getComputedStyle(document.querySelector('.bj-search-cut'))
  const hl = getComputedStyle(document.querySelector('.bj-search-hl'))
  return { bg: cs.backgroundColor, fg: row.color, hlBg: hl.backgroundColor }
})
check('R8 夜读搜索纸片可读：纸片底=夜面、正文=浅墨、高亮=透明赭洗', nightSearch.bg === 'rgb(33, 27, 20)' && nightSearch.fg === 'rgb(181, 166, 136)' && nightSearch.hlBg !== 'rgba(0, 0, 0, 0)')
await page.screenshot({ path: `${SHOTS}/29-search-night.png`, fullPage: true })
await page.keyboard.press('Escape')
await page.waitForSelector('[data-search-sheet]', { state: 'detached', timeout: 3000 })
await page.click(`.bj-cell[data-date="${today}"]`)
await page.waitForSelector('.bj-card')
await page.click('.bj-mode-seg-btn:has-text("图")')
await page.waitForSelector('[data-graph-field]', { timeout: 6000 })
const nightGraph = await page.evaluate(() => {
  const chip = getComputedStyle(document.querySelector('[data-graph-chip]'))
  const col = getComputedStyle(document.querySelector('.bj-graph-day'))
  const line = getComputedStyle(document.querySelector('.bj-graph-line'))
  return { chipFg: chip.color, chipBg: chip.backgroundColor, colFg: col.color, stroke: line.stroke }
})
check('R8 夜读图模式可读：chip 深纸浅墨、日期墨印与发丝线仍见', nightGraph.chipFg === 'rgb(233, 221, 195)' && nightGraph.chipBg === 'rgb(42, 35, 24)' && nightGraph.colFg === 'rgb(125, 112, 90)' && nightGraph.stroke === 'rgb(182, 144, 94)')
await page.screenshot({ path: `${SHOTS}/30-graph-night.png`, fullPage: true })

// —— R9 夜读取证（R8 法律延伸）：五种新卡型全部回卡片目光下现形，
//    机判 = 名题面永不见 ink-faint（该安静不该消失），底面永是真夜纸令牌。双截图背书五型上屏。
await page.click('.bj-mode-seg-btn:has-text("卡片")')
await page.waitForSelector('.bj-card', { timeout: 4000 })
await page.waitForTimeout(900) // 等五型资产 chip 出 blob 名
const nightR9 = await page.evaluate(() => {
  const FAINT = 'rgb(125, 112, 90)'
  const NIGHT_CARD = 'rgb(42, 35, 24)'
  const probes = [
    ['声音题名', '.bj-card.be-audio .bj-file-name'],
    ['影纸题名', '.bj-card.be-video .bj-video-name'],
    ['火漆题名', '.bj-card.be-pdf .bj-file-name'],
    ['代码正文', 'pre[data-code-view]'],
    ['题签题面', '.bj-card.be-link .bj-link-face'],
    ['改名题签', '.bj-card.be-image .bj-img-name'],
  ]
  const got = {}
  for (const [k, sel] of probes) {
    const el = document.querySelector(sel)
    got[k] = el === null ? null : getComputedStyle(el).color
  }
  const kinds = ['be-audio', 'be-video', 'be-pdf', 'be-code', 'be-link'].filter((c) => document.querySelector(`.bj-card.${c}`) !== null)
  const chipBg = document.querySelector('.bj-card.be-audio') ? getComputedStyle(document.querySelector('.bj-card.be-audio')).backgroundColor : ''
  return { got, kinds, chipBg, faintHunt: [...document.querySelectorAll('.bj-card.be-audio *, .bj-card.be-video *, .bj-card.be-pdf *, .bj-card.be-code *, .bj-card.be-link *')].filter((e) => getComputedStyle(e).color === FAINT && (e.textContent || '').trim() !== '').length }
})
const NIGHT_FAINT = 'rgb(125, 112, 90)'
const NIGHT_CARD_BG = 'rgb(42, 35, 24)'
const namedOk = Object.values(nightR9.got).every((v) => v !== null && v !== NIGHT_FAINT)
check(`R9 夜读五型上屏（${nightR9.kinds.join('/')}）+ 名题面零 ink-faint 机判：该安静不该消失`, nightR9.kinds.length === 5 && namedOk && nightR9.faintHunt === 0 && nightR9.chipBg === NIGHT_CARD_BG)
await page.screenshot({ path: `${SHOTS}/32-r9-night-kinds.png`, fullPage: true })
// 五型逐纸取证（fullPage 拍不进内滚画布深处）：每型 scrollIntoView 后截当屏。
for (const sel of ['.bj-card.be-audio', '.bj-card.be-video', '.bj-card.be-pdf', '.bj-card.be-code', '.bj-card.be-link']) {
  await page.evaluate((q) => document.querySelector(q)?.scrollIntoView({ block: 'center' }), sel)
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${SHOTS}/33-r9-night-${sel.replace('.bj-card.be-', '')}.png` })
}
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

// —— R5 手机真触摸造叠+拖入：CDP touch 走线上指针管线，390 屏上纸叠必须照样成立 ——
await mpage.tap('button[aria-label="造叠"]')
await mpage.waitForSelector('.bj-card.be-container', { timeout: 4000 })
const mMat0 = await mpage.evaluate(() => {
  document.querySelector('.bj-card.be-container').scrollIntoView({ block: 'end' })
  const m = document.querySelector('.bj-card.be-container')
  const k = [...document.querySelectorAll('.bj-card:not(.be-container)')].find((e) => (e.textContent || '').includes('手机上落的一笔'))
  if (k === undefined) return null
  const mr = m.getBoundingClientRect()
  const kr = k.getBoundingClientRect()
  return { mx: mr.x, my: mr.y, mw: mr.width, mh: mr.height, kx: kr.x, ky: kr.y, sel: m.classList.contains('is-sel'), whisper: (m.querySelector('.bj-stack-whisper')?.textContent || '') }
})
check('mobile R5 造叠：390 屏空垫纸即刻选中、耳语可见', mMat0 !== null && mMat0.sel === true && mMat0.whisper.includes('拖一张纸进来'))
await touchDrag(mMat0.kx + 24, mMat0.ky + 14, mMat0.mx + mMat0.mw / 2, mMat0.my + mMat0.mh / 2)
await mpage.waitForTimeout(1600) // debounce + 串行链
const mNote = ((await mpage.locator('.bj-stack-note').textContent().catch(() => '')) || '').trim()
check('mobile R5 真触摸拖入：小注「1 张」上纸', mNote === '1 张')
await mpage.reload()
await mpage.waitForSelector('.bj-card.be-container')
const dM = await dump(mpage)
const dayM = dM.journals.find((j) => j.date === today)
const matM = dayM.cards.find((c) => c.kind === 'container')
const kidM = dayM.cards.find((c) => (c.text || '').includes('手机上落的一笔'))
check('mobile R5 拖入过缝：children 落库 reload 仍在', matM.children?.includes(kidM.id) === true)
await mpage.screenshot({ path: `${SHOTS}/22-mobile-stack.png` })

// —— R7 手机真触摸牵线（390）：CDP touch 走同一套 pointer 管线，纸黄昏与线在手机上也成立 ——
{
  const touchTap = async (x, y) => {
    const p = { x, y, radiusX: 1, radiusY: 1, force: 1 }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await mpage.waitForTimeout(350)
  }
  await mpage.tap('.bj-add')
  let ta = mpage.locator('textarea').first()
  await ta.waitFor({ timeout: 4000 })
  await ta.fill('手机牵A')
  await mpage.evaluate(() => window.getSelection()?.removeAllRanges())
  await touchTap(24, 120) // 点空气泡退编辑并结算
  await mpage.waitForTimeout(1200)
  await mpage.tap('.bj-add')
  ta = mpage.locator('textarea').first()
  await ta.waitFor({ timeout: 4000 })
  await ta.fill('手机牵B')
  await mpage.evaluate(() => window.getSelection()?.removeAllRanges())
  await touchTap(24, 120)
  await mpage.waitForTimeout(1200)
  const mIds = await mpage.evaluate(() => {
    const of = (t) => [...document.querySelectorAll('.bj-card')].find((e) => (e.textContent || '').includes(t))?.getAttribute('data-card-id') ?? null
    return { a: of('手机牵A'), b: of('手机牵B') }
  })
  if (mIds.a === null || mIds.b === null) throw new Error('R7 手机夹具：牵A/牵B 没落纸')
  const tapCardM = async (id) => {
    const p = await mpage.evaluate((i) => {
      const el = document.querySelector(`[data-card-id="${i}"]`)
      el.scrollIntoView({ block: 'center' })
      const r = el.getBoundingClientRect()
      return { x: r.x + 24, y: r.y + 14 }
    }, id)
    await touchTap(p.x, p.y)
  }
  await tapCardM(mIds.a)
  await mpage.tap('[aria-label="卡片菜单"]')
  await mpage.tap('.bj-menu-item:has-text("牵线")')
  await mpage.waitForTimeout(400)
  const duskM = await mpage.evaluate((s) => ({
    day: document.querySelector('.bj-day')?.getAttribute('data-linking') === 'true',
    target: document.querySelector(`[data-card-id="${s.b}"]`)?.getAttribute('data-link') === 'target',
  }), mIds)
  check('R7 手机 起牵：data-linking 与靶纸点亮在 390 屏成立', duskM.day === true && duskM.target === true)
  await tapCardM(mIds.b)
  await mpage.waitForTimeout(1200)
  const lineM = await mpage.locator('g.bj-line').count()
  check('R7 手机 真触摸牵线成线（SVG 在纸下画上）', lineM === 1)
  await mpage.screenshot({ path: `${SHOTS}/27-mobile-link.png` })
  await mpage.reload()
  await mpage.waitForSelector('.bj-card')
  await mpage.waitForTimeout(1200)
  check('R7 手机 牵线过缝落库：reload 线还在', (await mpage.locator('g.bj-line').count()) === 1)
}

// —— R8 手机 390：搜索纸片可用（输入 ≥16px 防理智缩放、结果行 ≥44px 触控、行点暖脉冲）——
{
  await mpage.tap('.bj-back')
  await mpage.waitForSelector('.bj-cell')
  await mpage.tap('button[aria-label="搜索手札"]')
  await mpage.waitForSelector('[data-search-sheet]', { timeout: 6000 })
  const mFont = await mpage.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.bj-search-input')).fontSize))
  check('R8 手机 搜索纸面上输入 ≥16px（键盘安全）', mFont >= 16)
  await mpage.fill('.bj-search-input', '手机牵')
  await mpage.waitForFunction(() => document.querySelectorAll('[data-search-row]').length >= 2, null, { timeout: 8000 })
  const mRowBox = await mpage.locator('[data-search-row]').first().boundingBox()
  check('R8 手机 结果行 ≥44px 可点', mRowBox !== null && mRowBox.height >= 44)
  await mpage.screenshot({ path: `${SHOTS}/31-mobile-search.png` })
  await mpage.locator('[data-search-row]').first().tap()
  const mPulsed = await mpage.waitForFunction(() => document.querySelector('[data-card-id].is-pulse') !== null, null, { timeout: 2500 }).then(() => true).catch(() => false)
  const mLanded = await mpage.evaluate((t) => ({
    onDay: window.location.hash === `#/d/${t}`,
    canvas: document.querySelector('.bj-canvas') !== null,
    sheetGone: document.querySelector('[data-search-sheet]') === null,
  }), today)
  check('R8 手机 行点=落卡片模式并脉冲那张纸（瞬态同桌面）', mLanded.onDay && mLanded.canvas && mLanded.sheetGone && mPulsed)
  await mpage.screenshot({ path: `${SHOTS}/31-mobile-search.png` })
}

// —— R9 手机 390：种类纸单在触屏成立（行 ≥44px 热区）、链接纸 CDP 真触摸落纸过缝、reload 仍在 ——
{
  await mpage.tap('.bj-back')
  await mpage.waitForSelector('.bj-cell')
  await mpage.click(`.bj-cell[data-date="${today}"]`)
  await mpage.waitForSelector('.bj-card')
  await mpage.tap('[aria-label="添一张卡·种类"]')
  await mpage.waitForSelector('[data-kind-sheet]', { timeout: 4000 })
  const mRows = await mpage.evaluate(() => [...document.querySelectorAll('[data-kind-row]')].map((b) => Math.round(b.getBoundingClientRect().height)))
  await mpage.tap('[data-kind-row="链接"]')
  await mpage.waitForSelector('[data-link-field]', { timeout: 4000 })
  await mpage.fill('[data-link-field]', 'https://m.example.org/r9-mobile')
  await mpage.keyboard.press('Enter')
  const pollM = async (fn, timeoutMs = 12000) => {
    const t0 = Date.now()
    for (;;) {
      if (await fn()) return true
      if (Date.now() - t0 > timeoutMs) return false
      await mpage.waitForTimeout(250)
    }
  }
  const mLink = await pollM(() => mpage.evaluate(() => document.querySelector('.bj-card.be-link a.bj-link-hair')?.href?.startsWith('https://m.example.org/r9-mobile') === true))
  const mStore = await pollM(async () => (await dump(mpage)).journals.flatMap((j) => j.cards).some((c) => c.kind === 'link' && c.url === 'https://m.example.org/r9-mobile'))
  await mpage.reload()
  await mpage.waitForSelector('.bj-card')
  const mBack = await mpage.evaluate(() => document.querySelector('.bj-card.be-link a.bj-link-hair')?.href ?? null)
  check('R9 手机 纸单五路 ≥44px 热区、真触摸题签纸上纸过缝、reload 仍渲染', mRows.every((h) => h >= 44) && mRows.length === 5 && mLink && mStore && mBack === 'https://m.example.org/r9-mobile')
  await mpage.screenshot({ path: `${SHOTS}/34-r9-mobile-link.png` })
}
await mctx.close()

await browser.close()
console.log('\nCONSOLE ERRORS:', errors.length)
errors.slice(0, 10).forEach((e) => console.log('  !', e))
console.log(fails.length ? `\n${String(fails.length)} FAILURES:\n` + fails.map((f) => '  - ' + f).join('\n') : '\nALL CHECKS PASSED')
process.exit(fails.length || errors.length ? 1 : 0)
