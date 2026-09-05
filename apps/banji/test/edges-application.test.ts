// R7 关系缝的应用层锁：addEdge 三闸（自牵/无卡/dedup 任一向）、撕线幂等、近日窗、线模式底料、
// 删卡同批剪边 + edgePatches 逐字回位双幂等、预检悬空端点闸、归档往返、D7 undo 圈语义回归。
// 吃真 repo（fake-indexeddb）+ 注入时钟；「时间戳是诚实数据」的拍板在这里被字节钉死。
import { afterEach, describe, expect, it } from 'vitest'
import { deleteDatabase, openRepo } from '../src/repository/repo'
import type { Repo } from '../src/repository/types'
import { createBanjiApp } from '../src/application'
import { buildDeleteSnapshot } from '../src/ui/undoSnapshot'
import { cardsByIdOf, collectSubtreeIds } from '../src/domain/gc'
import type { Card, CardId, EdgeRecord } from '../src/domain/types'
import { containerCard, edgeOf, isoAt, textCard, tid } from './helpers'
import { buildWorld, FIXED_NOW, repackZip, seedRepoWorld, snapshotRepo, unzipAll, utf8, wipeAll } from './archiveFixtures'
import { canonicalJson } from '../src/archive/format'

let seq = 0
const open = async (): Promise<{ repo: Repo; name: string }> => {
  const name = `banji-edge-${String(++seq)}`
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
const idOf = (s: string): CardId => s as CardId
const putDay = async (repo: Repo, date: string, cards: Card[]): Promise<void> => {
  await repo.journals.put({ date, cards, updatedAt: isoAt(1) })
}

describe('addEdge 三闸 + deleteEdge + listEdgesForCards', () => {
  it('牵手成功：契约字段齐、时间戳同枚取注入时钟、库里存的就是返回的那份', async () => {
    const { repo, name } = await open()
    protect(repo, name)
    const app = appOf(repo)
    const a = await app.addCard(T, { kind: 'text', props: { text: '甲' } })
    const b = await app.addCard(T, { kind: 'text', props: { text: '乙' } })
    const e = await app.addEdge(a.id, b.id)
    expect(e).not.toBeNull()
    if (e === null) return
    expect({ ...e }).toEqual({ id: e.id, source: a.id, target: b.id, createdAt: ISO, updatedAt: ISO })
    expect(await repo.edges.get(e.id)).toEqual(e)
  })

  it('自牵静默拒（不抛、不落）', async () => {
    const { repo, name } = await open()
    protect(repo, name)
    const app = appOf(repo)
    const a = await app.addCard(T, { kind: 'text', props: { text: '孤' } })
    expect(await app.addEdge(a.id, a.id)).toBeNull()
    expect(await repo.edges.list()).toEqual([])
  })

  it('端点无卡静默拒：源缺 / 靶缺（另一日有卡也算有卡——跨日牵手是产品特征）', async () => {
    const { repo, name } = await open()
    protect(repo, name)
    const app = appOf(repo)
    const a = await app.addCard(T, { kind: 'text', props: { text: '在' } })
    expect(await app.addEdge(tid('ghost'), a.id)).toBeNull()
    expect(await app.addEdge(a.id, tid('ghost'))).toBeNull()
    await putDay(repo, '2026-01-14', [textCard('昨日', { id: idOf('prev') })])
    const e = await app.addEdge(a.id, idOf('prev'))
    expect(e).not.toBeNull()
    expect(await repo.edges.list()).toHaveLength(1)
  })

  it('dedup：同对再牵正反向都静默 null——role 休眠期一根线就够', async () => {
    const { repo, name } = await open()
    protect(repo, name)
    const app = appOf(repo)
    const a = await app.addCard(T, { kind: 'text', props: { text: '甲' } })
    const b = await app.addCard(T, { kind: 'text', props: { text: '乙' } })
    expect(await app.addEdge(a.id, b.id)).not.toBeNull()
    expect(await app.addEdge(a.id, b.id)).toBeNull()
    expect(await app.addEdge(b.id, a.id)).toBeNull()
    expect(await repo.edges.list()).toHaveLength(1)
  })

  it('撕线摘除；不存在的 id 幂等静默；触及集合是两向并集去重', async () => {
    const { repo, name } = await open()
    protect(repo, name)
    const app = appOf(repo)
    const a = await app.addCard(T, { kind: 'text', props: { text: 'a' } })
    const b = await app.addCard(T, { kind: 'text', props: { text: 'b' } })
    const c = await app.addCard(T, { kind: 'text', props: { text: 'c' } })
    const e1 = await app.addEdge(a.id, b.id)
    const e2 = await app.addEdge(c.id, a.id)
    if (e1 === null || e2 === null) throw new Error('夹具牵线失败')
    expect((await app.listEdgesForCards([a.id, b.id])).map((x) => x.id).sort()).toEqual([e1.id, e2.id].sort())
    await app.deleteEdge(e1.id)
    expect(await repo.edges.get(e1.id)).toBeUndefined()
    await app.deleteEdge('这条不存在')
    expect((await repo.edges.list()).map((x) => x.id)).toEqual([e2.id])
  })
})

describe('getRecentCards / loadAll', () => {
  it('近日窗是 [anchor−14, anchor)：地板含、外沿不含、anchor 当日不出、新日在前、垫纸出局', async () => {
    const { repo, name } = await open()
    protect(repo, name)
    const app = appOf(repo)
    await putDay(repo, T, [containerCard([], { id: idOf('mat') }), textCard('当日', { id: idOf('d0') })])
    await putDay(repo, '2026-01-14', [textCard('昨日', { id: idOf('d1') })])
    await putDay(repo, '2026-01-01', [textCard('地板', { id: idOf('d14') })]) // anchor−14：入选
    await putDay(repo, '2025-12-31', [textCard('窗底', { id: idOf('d15') })]) // anchor−15：出局
    const rs = await app.getRecentCards(T, 14)
    expect(rs.map((r) => r.card.id)).toEqual([idOf('d1'), idOf('d14')])
    expect(rs.every((r) => r.card.kind !== 'container')).toBe(true)
  })

  it('附件卡候选带资产名（入库的那份权威 name）', async () => {
    const { repo, name } = await open()
    protect(repo, name)
    const app = appOf(repo)
    const rec = await app.addAsset(new File([utf8.encode('字节')], '槐花.png', { type: 'image/png' }))
    await putDay(repo, '2026-01-14', [textCard('x', { id: idOf('imgday'), kind: 'image', props: { hash: rec.hash } })])
    const rs = await app.getRecentCards(T, 14)
    expect(rs[0]?.assetName).toBe('槐花.png')
  })

  it('loadAllCards 全档平铺带日期升序；loadAllEdges 全量', async () => {
    const { repo, name } = await open()
    protect(repo, name)
    const app = appOf(repo)
    await putDay(repo, '2026-01-14', [textCard('昨', { id: idOf('y') })])
    await putDay(repo, T, [textCard('今', { id: idOf('t') })])
    const all = await app.loadAllCards()
    expect(all.map((x) => [x.date, x.card.id])).toEqual([
      ['2026-01-14', idOf('y')],
      [T, idOf('t')],
    ])
    const e = await app.addEdge(idOf('y'), idOf('t'))
    if (e === null) throw new Error('夹具牵线失败')
    expect(await app.loadAllEdges()).toEqual([e])
  })
})

describe('删卡剪边（D4 同批）与 edgePatches 回位', () => {
  it('撕一张牵着线的纸：级联 + 触及边同批剪净，返回值就是被剪边的逐字副本', async () => {
    const { repo, name } = await open()
    protect(repo, name)
    const app = appOf(repo)
    await putDay(repo, T, [textCard('甲', { id: idOf('a') }), textCard('乙', { id: idOf('b') }), textCard('丙', { id: idOf('c') })])
    await putDay(repo, '2026-01-14', [textCard('远', { id: idOf('far') })])
    const ab = await app.addEdge(idOf('a'), idOf('b'))
    const af = await app.addEdge(idOf('a'), idOf('far'))
    if (ab === null || af === null) throw new Error('夹具牵线失败')
    const pruned = await app.deleteCardCascade(T, idOf('a'))
    expect(pruned.map((e) => e.id).sort()).toEqual([ab.id, af.id].sort())
    expect(pruned).toContainEqual(ab)
    expect(pruned).toContainEqual(af)
    expect(await repo.edges.list()).toEqual([])
  })

  it('级联到子纸：孙子牵的线也剪（整棵树触及面）', async () => {
    const { repo, name } = await open()
    protect(repo, name)
    const app = appOf(repo)
    const g = textCard('孙', { id: idOf('g') })
    const kid = containerCard([g.id], { id: idOf('kid') })
    const mat = containerCard([kid.id], { id: idOf('mat') })
    const out = textCard('外', { id: idOf('out') })
    await putDay(repo, T, [mat, kid, g, out])
    const e = await app.addEdge(g.id, out.id)
    if (e === null) throw new Error('夹具牵线失败')
    const pruned = await app.deleteCardCascade(T, mat.id)
    expect(pruned).toEqual([e])
    expect(await repo.edges.list()).toEqual([])
  })

  it('既在叠里又牵着线的纸被撕：parentPatches+edgePatches 同框、再想想逐字复原、双次幂等', async () => {
    const { repo, name } = await open()
    protect(repo, name)
    const app = appOf(repo)
    const kid = textCard('内应', { id: idOf('kid') })
    const home = containerCard([kid.id], { id: idOf('home'), pos: { x: 8, y: 8 }, size: { w: 300, h: 300 } })
    const friend = textCard('外援', { id: idOf('friend') })
    const cards: Card[] = [home, kid, friend]
    await putDay(repo, T, cards)
    const e = await app.addEdge(kid.id, friend.id)
    if (e === null) throw new Error('夹具牵线失败')
    const doomed = collectSubtreeIds(cardsByIdOf(cards), kid.id)
    const snap = buildDeleteSnapshot(cards, doomed, await app.listEdgesForCards(cards.map((c) => c.id)))
    expect(snap.snapshot.parentPatches).toEqual([{ parentId: idOf('home'), childId: idOf('kid'), index: 0 }])
    expect(snap.snapshot.edgePatches).toEqual([e])
    await app.deleteCardCascade(T, kid.id)
    expect(await repo.edges.list()).toEqual([])
    await app.restoreCards(T, snap.snapshot)
    expect(await repo.edges.list()).toEqual([e]) // 逐字：id/端点/时间戳一件不重生
    expect((await repo.journals.get(T))?.cards.find((c) => c.id === 'home')?.children).toEqual([idOf('kid')])
    await app.restoreCards(T, snap.snapshot)
    expect(await repo.edges.list()).toEqual([e]) // 双次幂等
    expect((await repo.journals.get(T))?.cards.find((c) => c.id === 'home')?.children).toEqual([idOf('kid')])
  })

  it('无 edgePatches 的旧快照（R4-R6 形状）也过得了恢复门（可选字段兼容）', async () => {
    const { repo, name } = await open()
    protect(repo, name)
    const app = appOf(repo)
    const a = textCard('纸', { id: idOf('x') })
    await app.restoreCards(T, { cards: [a], parentPatches: [] })
    expect((await repo.journals.get(T))?.cards).toEqual([a])
    expect(await repo.edges.list()).toEqual([])
  })
})

describe('预检悬空端点闸（D4 对称）', () => {
  async function poisonZip(poisonAt: 'source' | 'target'): Promise<{ zip: Uint8Array; repo: Repo }> {
    const world = await buildWorld()
    const cardId = world.journals[0]?.cards[0]?.id ?? tid('x')
    const { repo, name } = await open()
    protect(repo, name)
    await seedRepoWorld(repo, world)
    const exp = await appOf(repo).exportToFile()
    if (!exp.archive.ok) throw new Error('导出夹具失败')
    const dangling = poisonAt === 'source' ? edgeOf(idOf('__无此卡__'), cardId) : edgeOf(cardId, idOf('__无此卡__'))
    const zip = repackZip(
      unzipAll(exp.archive.zip).map((f) =>
        f.name === 'edges.json' ? { name: f.name, data: utf8.encode(canonicalJson([dangling])) } : f,
      ),
    )
    return { zip, repo }
  }

  it('source 悬空：拒绝、报 edge.dangling_endpoint、库内分毫不动', async () => {
    const { zip, repo } = await poisonZip('source')
    const base = await snapshotRepo(repo)
    const r = await appOf(repo).importFromFile(zip)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('edge.dangling_endpoint')
    expect(await snapshotRepo(repo)).toEqual(base)
  })

  it('target 悬空：同一道闸（两端方向都要查）', async () => {
    const { zip, repo } = await poisonZip('target')
    const base = await snapshotRepo(repo)
    const r = await appOf(repo).importFromFile(zip)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('edge.dangling_endpoint')
    expect(await snapshotRepo(repo)).toEqual(base)
  })

  it('端点都在档的正例放行（不冤枉自家档案）', async () => {
    const world = await buildWorld()
    const ids = world.journals[0]?.cards.map((c) => c.id) ?? []
    if (ids.length < 2) throw new Error('夹具缺卡')
    world.edges.push(edgeOf(ids[0] as CardId, ids[1] as CardId))
    const { repo, name } = await open()
    protect(repo, name)
    await seedRepoWorld(repo, world)
    const r = await appOf(repo).importFromFile(await exportZipOf(repo))
    expect(r.ok).toBe(true)
  })
})

async function exportZipOf(repo: Repo): Promise<Uint8Array> {
  const { exportArchive } = await import('../src/archive/exportArchive')
  const r = await exportArchive(repo, { now: () => FIXED_NOW })
  if (!r.ok) throw new Error('导出失败')
  return r.zip
}

describe('归档往返（D6）与 undo 圈语义回归（D7）', () => {
  it('两条线 export→wipe→import：stats 计数、id/端点/时间戳逐字回魂', async () => {
    const world = await buildWorld()
    const ids = world.journals.flatMap((j) => j.cards.map((c) => c.id))
    const a = ids[0] as CardId
    const b = ids[1] as CardId
    const c = ids[2] as CardId
    world.edges.push(edgeOf(a, b), edgeOf(b, c))
    const { repo, name } = await open()
    protect(repo, name)
    const app = appOf(repo)
    await seedRepoWorld(repo, world)
    const zip = await exportZipOf(repo)
    const before = (await repo.edges.list()).sort((x, y) => (x.id < y.id ? -1 : 1))
    await wipeAll(repo)
    const r = await app.importFromFile(zip)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.stats.edges).toBe(2)
    const after = (await repo.edges.list()).sort((x, y) => (x.id < y.id ? -1 : 1))
    expect(after).toEqual(before)
  })

  it('D7 拍板：撕下→再想想→导出 ≡ 原档（strip updatedAt/addedAt/exportedAt、卡序归一后深相等）', async () => {
    const { repo, name } = await open()
    protect(repo, name)
    const clock = { t: Date.UTC(2026, 0, 15, 9, 0, 0) }
    const app = createBanjiApp(repo, { now: () => new Date(clock.t) })
    const a = await app.addCard(T, { kind: 'text', props: { text: '甲' } })
    const b = await app.addCard(T, { kind: 'text', props: { text: '乙' } })
    const e = await app.addEdge(a.id, b.id)
    if (e === null) throw new Error('夹具牵线失败')
    const pristine = await app.exportToFile()
    if (!pristine.archive.ok) throw new Error('原档导出失败')
    clock.t += 1000
    const doc = await repo.journals.get(T)
    if (doc === undefined) throw new Error('夹具缺文档')
    const doomed = collectSubtreeIds(cardsByIdOf(doc.cards), b.id)
    const snap = buildDeleteSnapshot(doc.cards, doomed, await repo.edges.list())
    await app.deleteCardCascade(T, b.id)
    expect(await repo.edges.list()).toEqual([])
    clock.t += 5000
    await app.restoreCards(T, snap.snapshot)
    expect(await repo.edges.list()).toEqual([e])
    clock.t += 1000
    const after = await app.exportToFile()
    if (!after.archive.ok) throw new Error('恢复后导出失败')
    const stripStamps = (v: unknown): unknown => {
      if (Array.isArray(v)) return v.map(stripStamps)
      if (v !== null && typeof v === 'object') {
        const out: Record<string, unknown> = {}
        for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
          if (k === 'updatedAt' || k === 'addedAt' || k === 'exportedAt') continue
          out[k] = stripStamps(x)
        }
        if (Array.isArray(out['cards'])) out['cards'] = (out['cards'] as { id: string }[]).slice().sort((p, q) => (p.id < q.id ? -1 : 1))
        return out
      }
      return v
    }
    const norm = (zip: Uint8Array): Record<string, unknown> => {
      const rec: Record<string, unknown> = {}
      for (const f of unzipAll(zip)) {
        const text = new TextDecoder().decode(f.data)
        rec[f.name] = f.name.endsWith('.json') ? stripStamps(JSON.parse(text)) : text
      }
      return rec
    }
    // 语义相等 ≠ 字节相等（D7 决策：时间戳是诚实数据）：这里证明的是「strip 之后等价」。
    expect(norm(after.archive.zip)).toEqual(norm(pristine.archive.zip))
  })
})
