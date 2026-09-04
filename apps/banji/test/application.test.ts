// 应用层用例锁行为：这是 UI 单元将要消费的缝，签名与语义在此钉死。
import { afterEach, describe, expect, it } from 'vitest'
import { deleteDatabase, openRepo } from '../src/repository/repo'
import type { Repo } from '../src/repository/types'
import { createBanjiApp, CardNotFoundError, InvalidDateError } from '../src/application'
import { exportArchive } from '../src/archive/exportArchive'
import { isUuidV7Shape } from '../src/domain/id'
import { containerCard, fileCard, imageCard, isoAt, textCard, tid } from './helpers'
import { buildWorld, FIXED_NOW, seedRepoWorld, utf8, type World } from './archiveFixtures'

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
