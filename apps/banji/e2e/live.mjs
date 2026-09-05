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
          .map((d) => ({ date: d.date, cards: d.cards.map((c) => ({ id: c.id, kind: c.kind, text: c.props?.text, hash: c.props?.hash, w: c.props?.w, h: c.props?.h, pos: c.pos, size: c.size, children: c.children ?? null })) }))
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

// —— R6 债#6 真浏览器竞态(桌面)：debounce 窗里的旧世界意图撞上导入 ack，必须整批弃世 ——
// 剧本：把子纸收编回垫纸过缝（staged 宇宙 = 真档案有 children）→ 导出暂存档案 →
//       老世界里撕下该子纸（strip 进 450ms 窗）→ 立刻再拖一张纸（窗重置，ack 一瞬必有在途意图）→
//       三段确认重导 staged。修前：strip/移动开火进新宇宙——children 被抹平 / 同 id 卡鬼移位；
//       修后：新宇宙逐字节=staged（deep-equal dump），且 ack 后再落一笔照常过缝（队列只弃旧不毒全）。
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
  // 老世界开火台：撕掉刚收编的子纸（strip 入窗：children 抹向 []）→ 立刻拖一张散纸（重置 450ms 窗）→ 抢先导入。
  // 修前若 strip/移动越过 ack 开火：新宇宙里垫纸的合法 children 被抹平、同 id 散纸鬼移位——dump 现形。
  await page.click(`[data-card-id="${nest.kidId}"]`, { position: { x: 20, y: 12 } })
  await page.click('[aria-label="卡片菜单"]')
  await page.click('.bj-menu-item:has-text("删除")')
  await page.click('button:has-text("确认删除")')
  const loose = await page.evaluate(() => {
    const k = [...document.querySelectorAll('.bj-card:not(.be-container)')].find((e) => (e.textContent || '').includes('槐花'))
    if (k === undefined) return null
    const r = k.getBoundingClientRect()
    const top = document.elementFromPoint(r.x + 24, r.y + 14)
    if (!(top instanceof Element) || top.closest('[data-card-id]') !== k) return null
    return { x: r.x, y: r.y }
  })
  if (loose === null) throw new Error('债#6 夹具：没有可抓到的散纸来重置窗口')
  await dragTo(loose.x + 24, loose.y + 14, loose.x + 90, loose.y + 16) // move 意图再入窗（单计时器重置）
  await page.click('.bj-day-head [aria-label="设置"]')
  await page.getByRole('button', { name: /导入/ }).click()
  await page.setInputFiles('input.bj-hidden-file', join(HERE, 'd1-stage.banjizip'))
  await page.waitForSelector('button:has-text("继续")', { timeout: 8000 })
  await page.click('button:has-text("继续")')
  await page.click('button:has-text("确认替换")')
  await page.waitForTimeout(1400) // 越过 450ms 窗：未被作废的旧意图会在这段里过缝现形
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
await mctx.close()

await browser.close()
console.log('\nCONSOLE ERRORS:', errors.length)
errors.slice(0, 10).forEach((e) => console.log('  !', e))
console.log(fails.length ? `\n${String(fails.length)} FAILURES:\n` + fails.map((f) => '  - ' + f).join('\n') : '\nALL CHECKS PASSED')
process.exit(fails.length || errors.length ? 1 : 0)
