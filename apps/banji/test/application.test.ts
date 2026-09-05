// 应用层用例锁行为：这是 UI 单元将要消费的缝，签名与语义在此钉死。
import { afterEach, describe, expect, it } from 'vitest'
import { deleteDatabase, openRepo } from '../src/repository/repo'
import type { Repo } from '../src/repository/types'
import { createBanjiApp, CardNotFoundError, InvalidDateError, InvalidRestoreError } from '../src/application'
import { sha256Hex } from '../src/archive/hash'
import { exportArchive } from '../src/archive/exportArchive'
import { isUuidV7Shape } from '../src/domain/id'
import { validateJournalDoc } from '../src/domain/validate'
import type { CardId } from '../src/domain/types'
import { containerCard, fileCard, imageCard, isoAt, textCard, tid } from './helpers'
import { buildWorld, FIXED_NOW, seedRepoWorld, snapshotRepo, utf8, wipeAll, type World } from './archiveFixtures'

let seq = 0
const open = async (): Promise<{ repo: Repo; name: string }> => {
  const name = `banji-app-${String(++seq)}`
  return { repo: await openRepo({ name }), name }
}
const tracked: Array<() => Promise<void>> = []
afterEach(async () => {
  while (tracked.length > 0) await tracked.pop()?.()
})
const protect = (repo: Repo, name: string): void => {
  tracked.push(async () => {
    repo.close()
    await deleteDatabase(name)
  })
}

const T = '2026-01-15'
const ISO = FIXED_NOW.toISOString()
const appOf = (repo: Repo) => createBanjiApp(repo, { now: () => FIXED_NOW })

describe('application: 卡片用例', () => {
  it('addCard 自动建当日文档；id 为 uuidv7 形状；时间戳取注入时钟', async () => {
    const { repo, name } = await open()
    protect(repo, name)
    const app = appOf(repo)
    const card = await app.addCard(T, { kind: 'text', props: { text: '第一条' } })
    expect(isUuidV7Shape(card.id)).toBe(true)
    expect(card.createdAt).toBe(ISO)
    expect(card.pos).toEqual({ x: 0, y: 0 })
    expect(card.size.w).toBeGreaterThan(0)
    expect((await repo.journals.get(T))?.cards).toEqual([card])
    const second = await app.addCard(T, { kind: 'text', props: { text: '第二条' }, z: 2.5 })
    expect((await repo.journals.get(T))?.cards.map((c) => c.id)).toEqual([card.id, second.id])
  })

  it('updateCard 合并补丁、冻结 id/createdAt、刷新 updatedAt；未知 id 抛 CardNotFoundError', async () => {
    const { repo, name } = await open()
    protect(repo, name)
    const app = appOf(repo)
    const card = await app.addCard(T, { kind: 'text', props: { text: '旧文' } })
    const late = new Date(Date.UTC(2026, 5, 5)).toISOString()
    const later = createBanjiApp(repo, { now: () => new Date(late) })
    const updated = await later.updateCard(T, card.id, { props: { text: '新文', format: 'md' }, meta: { color: 'ink' } })
    expect(updated.id).toBe(card.id)
    expect(updated.createdAt).toBe(card.createdAt)
    expect(updated.updatedAt).toBe(late)
    expect(updated.props).toEqual({ text: '新文', format: 'md' })
    expect((await repo.journals.get(T))?.updatedAt).toBe(late)
    await expect(later.updateCard(T, tid('不存在'), { meta: {} })).rejects.toBeInstanceOf(CardNotFoundError)
  })

  it('moveCard 只改 pos；resizeCard 只改 size；互不侵犯其余字段', async () => {
    const { repo, name } = await open()
    protect(repo, name)
    const app = appOf(repo)
    const card = await app.addCard(T, { kind: 'text', props: { text: 'x' } })
    const moved = await app.moveCard(T, card.id, { x: -4.5, y: 12 })
    expect(moved.pos).toEqual({ x: -4.5, y: 12 })
    expect(moved.size).toEqual(card.size)
    expect(moved.createdAt).toBe(card.createdAt)
    const resized = await app.resizeCard(T, card.id, { w: 101.5, h: 50 })
    expect(resized.size).toEqual({ w: 101.5, h: 50 })
    expect(resized.pos).toEqual(moved.pos)
  })

  it('deleteCardCascade 连根拔起整棵容器子树；资产一个字节都不删（GC 只在导出）', async () => {
    const { repo, name } = await open()
    protect(repo, name)
    const app = appOf(repo)
    const img = imageCard('a'.repeat(64), { id: tid('img') })
    const leaf = textCard('孙辈', { id: tid('leaf') })
    const inner = containerCard([img.id, leaf.id], { id: tid('inner') })
    const outer = containerCard([inner.id], { id: tid('outer') })
    const stray = fileCard('b'.repeat(64), { id: tid('stray') })
    await repo.journals.put({ date: T, cards: [outer, inner, img, leaf, stray], updatedAt: isoAt() })
    await repo.assets.put({ hash: 'a'.repeat(64), mime: 'image/png', size: 1, addedAt: isoAt(), blob: new Blob(['x']) })

    await app.deleteCardCascade(T, outer.id)
    expect((await repo.journals.get(T))?.cards.map((c) => c.id)).toEqual([stray.id])
    expect(await repo.assets.get('a'.repeat(64))).toBeDefined() // 图片卡被级联删了，资产仍活得好好的
    await expect(app.deleteCardCascade(T, tid('nope'))).rejects.toBeInstanceOf(CardNotFoundError)
  })

  it('非法日期在任何读写用例上统一抛 InvalidDateError', async () => {
    const { repo, name } = await open()
    protect(repo, name)
    const app = appOf(repo)
    await expect(app.getJournal('2026-13-01')).rejects.toBeInstanceOf(InvalidDateError)
    await expect(app.addCard('不是日期', { kind: 'text', props: { text: '' } })).rejects.toBeInstanceOf(InvalidDateError)
    await expect(app.restoreCards('不是日期', { cards: [], parentPatches: [] })).rejects.toBeInstanceOf(InvalidDateError)
  })
})

describe('application: restoreCards（删除撤销缝 —— 逐字写回，命令历史住 UI 内存）', () => {
  it('级联删除后按快照恢复：ids/时间戳/props/z/pos/size 逐字自等，只 bump 文档 updatedAt', async () => {
    const { repo, name } = await open()
    protect(repo, name)
    const app = appOf(repo)
    const leaf = textCard('孙辈', { id: tid('leaf'), pos: { x: 660, y: 940 }, size: { w: 210, h: 88 }, z: 3.5 })
    const box = containerCard([leaf.id], { id: tid('box'), pos: { x: 700, y: 900 }, z: 4 })
    const stray = fileCard('b'.repeat(64), { id: tid('stray') })
    await repo.journals.put({ date: T, cards: [box, leaf, stray], updatedAt: isoAt() })
    const before = await repo.journals.get(T)
    if (before === undefined) throw new Error('前置文档丢失')
    const doomed = before.cards.filter((c) => c.id === box.id || c.id === leaf.id)
    const parent = structuredClone(before.cards.find((c) => c.id === box.id))
    if (parent === undefined) throw new Error('前置容器丢失')

    await app.deleteCardCascade(T, box.id)
    expect((await repo.journals.get(T))?.cards.map((c) => c.id)).toEqual([stray.id])

    const late = new Date(Date.UTC(2026, 5, 5)).toISOString()
    await createBanjiApp(repo, { now: () => new Date(late) }).restoreCards(T, { cards: doomed, parentPatches: [] })
    const after = await repo.journals.get(T)
    expect(after?.updatedAt).toBe(late)
    const restored = after?.cards.filter((c) => c.id !== stray.id) ?? []
    expect(structuredClone(restored)).toEqual(doomed.map((c) => structuredClone(c)))
    expect(restored.find((c) => c.id === box.id)?.children).toEqual(parent.children)
    expect(restored.find((c) => c.id === leaf.id)?.pos).toEqual({ x: 660, y: 940 })
  })

  it('parentPatches 把幸存父卡的引用按原 index 重插；index 越界钳制到末尾', async () => {
    const { repo, name } = await open()
    protect(repo, name)
    const app = appOf(repo)
    const keepA = textCard('甲', { id: tid('ka') })
    const gone = textCard('乙', { id: tid('gone') })
    const keepB = textCard('丙', { id: tid('kb') })
    const parent = containerCard([keepA.id, gone.id, keepB.id], { id: tid('p') })
    await repo.journals.put({ date: T, cards: [parent, keepA, gone, keepB], updatedAt: isoAt() })
    await app.deleteCardCascade(T, gone.id)
    // 级联只拔 gone 自身；父卡 children[] 留悬空引用（v1 无 UI 可造，此处手工修成删除后果）
    const doc = await repo.journals.get(T)
    if (doc === undefined) throw new Error('文档丢失')
    await repo.journals.put({
      ...doc,
      cards: doc.cards.map((c) => (c.id === parent.id ? { ...c, children: [keepA.id, keepB.id] } : c)),
    })

    await app.restoreCards(T, {
      cards: [structuredClone(gone)],
      parentPatches: [{ parentId: parent.id, childId: gone.id, index: 1 }],
    })
    expect((await repo.journals.get(T))?.cards.find((c) => c.id === parent.id)?.children).toEqual([keepA.id, gone.id, keepB.id])

    await app.deleteCardCascade(T, gone.id)
    const shrunk = await repo.journals.get(T)
    if (shrunk === undefined) throw new Error('文档丢失')
    await repo.journals.put({
      ...shrunk,
      cards: shrunk.cards.map((c) => (c.id === parent.id ? { ...c, children: [keepA.id, keepB.id] } : c)),
    })
    await app.restoreCards(T, {
      cards: [structuredClone(gone)],
      parentPatches: [{ parentId: parent.id, childId: gone.id, index: 99 }],
    })
    const clamped = (await repo.journals.get(T))?.cards.find((c) => c.id === parent.id)?.children
    expect(clamped).toEqual([keepA.id, keepB.id, gone.id])
  })

  it('双次 undo 幂等：卡不复制、children 引用不重复', async () => {
    const { repo, name } = await open()
    protect(repo, name)
    const app = appOf(repo)
    const leaf = textCard('孙辈', { id: tid('leaf2') })
    const box = containerCard([leaf.id], { id: tid('box2') })
    await repo.journals.put({ date: T, cards: [box, leaf], updatedAt: isoAt() })
    const snapshot = { cards: [structuredClone(box), structuredClone(leaf)], parentPatches: [] }
    await app.deleteCardCascade(T, box.id)
    await app.restoreCards(T, snapshot)
    await app.restoreCards(T, snapshot)
    const ids = (await repo.journals.get(T))?.cards.map((c) => c.id) ?? []
    expect(ids.sort()).toEqual([box.id, leaf.id].sort())
  })

  it('该日文档已被清空时 restoreCards 自动建档（与 addCard 同规）', async () => {
    const { repo, name } = await open()
    protect(repo, name)
    const app = appOf(repo)
    const card = textCard('独苗', { id: tid('only') })
    await repo.journals.put({ date: T, cards: [card], updatedAt: isoAt() })
    await app.deleteCardCascade(T, card.id)
    expect((await repo.journals.get(T))?.cards).toEqual([])
    await app.restoreCards(T, { cards: [structuredClone(card)], parentPatches: [] })
    expect((await repo.journals.get(T))?.cards).toEqual([card])
  })

  it('坏快照不过校验：整个写回作废，库内文档保持删除后原样', async () => {
    const { repo, name } = await open()
    protect(repo, name)
    const app = appOf(repo)
    const card = textCard('好卡', { id: tid('ok1') })
    await repo.journals.put({ date: T, cards: [card], updatedAt: isoAt() })
    const broken = structuredClone(card)
    broken.id = '' as CardId
    const before = structuredClone(await repo.journals.get(T))
    await expect(app.restoreCards(T, { cards: [broken], parentPatches: [] })).rejects.toBeInstanceOf(InvalidRestoreError)
    expect(structuredClone(await repo.journals.get(T))).toEqual(before)
  })
})

describe('application: 日历与归档用例', () => {
  it('getMonth 只列出有内容（卡片非空）的当月日期，升序；跨月不串', async () => {
    const { repo, name } = await open()
    protect(repo, name)
    await repo.journals.put({ date: '2026-01-20', cards: [], updatedAt: isoAt() })
    await repo.journals.put({ date: '2026-01-02', cards: [textCard('a')], updatedAt: isoAt() })
    await repo.journals.put({ date: '2026-02-01', cards: [textCard('b')], updatedAt: isoAt() })
    const app = appOf(repo)
    expect(await app.getMonth(2026, 1)).toEqual(['2026-01-02'])
    expect(await app.getMonth(2026, 2)).toEqual(['2026-02-01'])
    expect(await app.getMonth(2025, 12)).toEqual([])
  })

  it('exportToFile 返回建议文件名与 ZIP 字节', async () => {
    const { repo, name } = await open()
    protect(repo, name)
    const world: World = await buildWorld()
    await seedRepoWorld(repo, world)
    const out = await appOf(repo).exportToFile()
    expect(out.filename).toBe(`banji-${ISO.slice(0, 10)}.banjizip`)
    if (!out.archive.ok) throw new Error(out.archive.userMessage)
    expect(out.archive.zip.byteLength).toBeGreaterThan(100)
  })

  it('importFromFile(Blob) 全量替换；垃圾输入 → zip_unreadable 且现有数据原封不动', async () => {
    const { repo, name } = await open()
    protect(repo, name)
    const world = await buildWorld()
    await seedRepoWorld(repo, world)
    const exported = await exportArchive(repo, { now: () => FIXED_NOW })
    if (!exported.ok) throw new Error(exported.userMessage)
    const app = appOf(repo)

    const junk = await app.importFromFile(new Blob([utf8.encode('这不是ZIP')]))
    expect(junk.ok).toBe(false)
    if (!junk.ok) expect(junk.reason).toBe('zip_unreadable')
    expect((await repo.journals.list()).map((d) => d.date)).toEqual(world.journals.map((d) => d.date).sort())

    const good = await app.importFromFile(new Blob([new Uint8Array(exported.zip)]))
    expect(good.ok).toBe(true)
    if (good.ok) expect(good.stats).toEqual({ journals: 2, cards: 8, edges: 0, settings: 2, assets: 2 })
    expect(await repo.journals.get('2026-01-15')).toEqual(world.journals[1])
  })

  it('close 释放数据库连接', async () => {
    const { repo, name } = await open()
    tracked.push(async () => {
      await deleteDatabase(name)
    })
    const app = appOf(repo)
    app.close()
    await expect(repo.journals.list()).rejects.toThrow()
  })
})

describe('application: 资产 / 设置 / 月摘要用例（T0 缝）', () => {
  it('addAsset 按内容寻址存入；字节原样往返（Blob 对象不降级为 ArrayBuffer）', async () => {
    const { repo, name } = await open()
    protect(repo, name)
    const app = appOf(repo)
    const bytes = utf8.encode('手札里的一小段字节')
    const rec = await app.addAsset(new Blob([bytes], { type: 'text/plain' }))
    expect(rec.hash).toBe(await sha256Hex(bytes))
    expect(rec.mime).toBe('text/plain')
    expect(rec.size).toBe(bytes.byteLength)
    expect(rec.addedAt).toBe(ISO)
    expect('name' in rec).toBe(false)

    const back = await app.getAsset(rec.hash)
    if (back === undefined) throw new Error('getAsset 应取回刚落库的资产')
    expect(back.blob).toBeInstanceOf(Blob)
    expect(new Uint8Array(await back.blob.arrayBuffer())).toEqual(bytes)
    expect(await app.getAsset('f'.repeat(64))).toBeUndefined()
  })

  it('addAsset 去重：同字节两次只落一条记录，File.name 随首次记录保留', async () => {
    const { repo, name } = await open()
    protect(repo, name)
    const app = appOf(repo)
    const bytes = utf8.encode('同一张图片')
    const first = await app.addAsset(new File([bytes], '照片 1.png', { type: 'image/png' }))
    expect(first.name).toBe('照片 1.png')
    const second = await app.addAsset(new File([bytes], '改名.png', { type: 'image/png' }))
    expect(second).toEqual(first)
    const all = await repo.assets.list()
    expect(all).toHaveLength(1)
    expect(all[0]?.hash).toBe(first.hash)
  })

  it('setSetting/getSetting：值形状入 settings store，覆盖写刷新 updatedAt（注入时钟）', async () => {
    const { repo, name } = await open()
    protect(repo, name)
    const app = appOf(repo)
    expect(await app.getSetting('theme')).toBeUndefined()
    await app.setSetting('theme', 'night')
    expect(await app.getSetting('theme')).toBe('night')
    const rec = await repo.settings.get('theme')
    if (rec === undefined) throw new Error('设置应落在 settings store')
    expect(rec).toEqual({ key: 'theme', value: 'night', updatedAt: ISO })
    await app.setSetting('theme', 'light')
    expect(await app.getSetting('theme')).toBe('light')
    const late = new Date(Date.UTC(2026, 5, 5)).toISOString()
    await createBanjiApp(repo, { now: () => new Date(late) }).setSetting('theme', { nested: true })
    expect(await app.getSetting('theme')).toEqual({ nested: true })
    const rec2 = await repo.settings.get('theme')
    expect(rec2?.updatedAt).toBe(late)
  })

  it('getMonthSummary：返回当月有内容日期的卡数（升序），空文档不计', async () => {
    const { repo, name } = await open()
    protect(repo, name)
    await repo.journals.put({ date: '2026-01-20', cards: [], updatedAt: isoAt() })
    await repo.journals.put({ date: '2026-01-02', cards: [textCard('a')], updatedAt: isoAt() })
    await repo.journals.put({ date: '2026-01-11', cards: [textCard('b'), textCard('c'), textCard('d')], updatedAt: isoAt() })
    await repo.journals.put({ date: '2026-02-01', cards: [textCard('串月')], updatedAt: isoAt() })
    expect(await appOf(repo).getMonthSummary(2026, 1)).toEqual([
      { date: '2026-01-02', cardCount: 1 },
      { date: '2026-01-11', cardCount: 3 },
    ])
    expect(await appOf(repo).getMonthSummary(2025, 12)).toEqual([])
  })
})

// 档案中毒判死（R5 债1 · prune-at-delete-commit 的归档侧收口）：store.remove() 在 deleteCardCascade 之后的
// 同一条串行链上发幸存父卡剥离——commitStack→diffIntents→updateCard 的接线由 UI 测试钉死（undo.test / stack-ui D6），
// 此处按 store 过缝的同一批缝调用（级联 → children 剥离补丁）钉「库中永不存谎言档案」：
// 过期无人回天之后，导出→wipe→重导必须整体过闸，幽灵绝不借档案还魂（中位次同时锁死 index: 1 的记录）。
describe('application: 删除同批剥引用 → 归档往返（档案中毒判死）', () => {
  const seedPoisonWorld = async (repo: Repo): Promise<{ parent: ReturnType<typeof containerCard>; keepA: ReturnType<typeof textCard>; gone: ReturnType<typeof textCard>; keepB: ReturnType<typeof textCard> }> => {
    const keepA = textCard('甲', { id: tid('pz-a') })
    const gone = textCard('乙', { id: tid('pz-gone') })
    const keepB = textCard('丙', { id: tid('pz-b') })
    const parent = containerCard([keepA.id, gone.id, keepB.id], { id: tid('pz-p') }) // 位次居中的引用，正是幽灵温床
    await repo.journals.put({ date: T, cards: [parent, keepA, gone, keepB], updatedAt: isoAt() })
    return { parent, keepA, gone, keepB }
  }

  it('given 居中子卡被撕 when 级联+剥离按 store 同批过缝 then 库内文档即过校验，导出→wipe→重导全闸放行且无幽灵还魂', async () => {
    const { repo, name } = await open()
    protect(repo, name)
    const app = appOf(repo)
    const { parent, keepA, gone, keepB } = await seedPoisonWorld(repo)
    await app.deleteCardCascade(T, gone.id)
    await app.updateCard(T, parent.id, { children: [keepA.id, keepB.id] }) // = commitStack 对这一张发的剥离补丁
    const committed = await repo.journals.get(T)
    if (committed === undefined) throw new Error('文档丢失')
    expect(validateJournalDoc(committed).ok).toBe(true) // 不等过期、不等导出：活库落定那一拍已无谎言
    const out = await app.exportToFile()
    if (!out.archive.ok) throw new Error(`干净档案理应可导: ${out.archive.userMessage}`)
    await wipeAll(repo) // 托盘过期后 wipe 库，档案是唯一指望
    const back = await app.importFromFile(new Blob([out.archive.zip]))
    expect(back.ok).toBe(true)
    if (!back.ok) throw new Error(back.userMessage)
    expect(back.stats.journals).toBe(1)
    const revived = await repo.journals.get(T)
    expect(revived?.cards.find((c) => c.id === parent.id)?.children).toEqual([keepA.id, keepB.id])
    expect(revived?.cards.map((c) => c.id)).not.toContain(gone.id)
    if (revived === undefined) throw new Error('重导入后当日丢失')
    expect(validateJournalDoc(revived).ok).toBe(true)
  })

  it('对照（修复前旧作为）：只级联不剥离 → 自家档案死在自家 child_missing 闸前，且闸拒归拒、现有数据原封不动', async () => {
    const { repo, name } = await open()
    protect(repo, name)
    const app = appOf(repo)
    const { gone } = await seedPoisonWorld(repo)
    await app.deleteCardCascade(T, gone.id) // v1 行为：children[] 里幽灵长住（过期后无人有权请走）
    const out = await app.exportToFile()
    if (!out.archive.ok) throw new Error(out.archive.userMessage) // 中毒照样出得去门——正是当年 Scenario
    const before = await snapshotRepo(repo)
    const back = await app.importFromFile(new Blob([out.archive.zip]))
    expect(back.ok).toBe(false)
    if (back.ok) throw new Error('中毒档案必须被拒')
    expect(back.reason).toBe('journal.invalid')
    expect(back.detail).toContain('journal.child_missing')
    expect(await snapshotRepo(repo)).toEqual(before) // 拒得诚实：一个字节都不许动
  })
})
