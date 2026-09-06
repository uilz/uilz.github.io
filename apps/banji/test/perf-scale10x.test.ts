// R13·D4 10× 规模证据——把 R11 预算宇宙的 2000 卡 / 600 边 / 200 天放大到近十年日记顶格：
// 19800 卡 / 5000 边 / 1800 天，仍走真缝（repo.put 批量落库；读侧全经 BanjiApp 缝）。
// 预算 = R11 四线 ×4：数据 ×10 只许付 ×4 的墙，越线才谈热路径手术（memoize 在缝头是唯一钦定动作）。
// 实测整文件墙钟 ~3.1s（落库 19800 卡/5000 边/1800 日在 fake-indexeddb 里就是快）——
// 不触 60s 慢轮线，故默认全量跑、零 skip：数字天天见光。预算×4 全数达标，手术不议。
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteDatabase, openRepo } from '../src/repository/repo'
import type { Repo } from '../src/repository/types'
import { createBanjiApp } from '../src/application'
import { searchCards } from '../src/domain/search'
import { threadOrder } from '../src/domain/edges'
import { graphLayout, type GraphEntry } from '../src/ui/graphLayout'
import { exportArchive } from '../src/archive/exportArchive'
import type { Card, CardId, EdgeRecord, JournalDoc } from '../src/domain/types'

const DAYS = 1800
const PER_DAY = 11
const CARD_TOTAL = DAYS * PER_DAY // 19800 ≈ 10× R11
const EDGE_TOTAL = 5000

const BUDGET_SEARCH_MS = 50 * 4
const BUDGET_LAYOUT_MS = 150 * 4
const BUDGET_BFS_MS = 150 * 4
const BUDGET_EXPORT_MS = 2000 * 4

const FIXED_NOW = new Date(Date.UTC(2026, 7, 1, 12, 0, 0))
const DAY_MS = 86_400_000

function pad(i: number): string {
  return String(i).padStart(5, '0')
}

function dayOf(i: number): string {
  return new Date(Date.UTC(2021, 8, 1) + i * DAY_MS).toISOString().slice(0, 10)
}

const allCards: Card[] = []
for (let i = 0; i < CARD_TOTAL; i++) {
  const id = `seed-${pad(i)}` as CardId
  const stamp = new Date(FIXED_NOW.getTime() + i * 1000).toISOString()
  const card: Card = {
    id,
    kind: i % 7 === 0 ? 'container' : 'text',
    pos: { x: 24, y: 24 + (i % 28) * 12 },
    size: { w: 300, h: 160 },
    z: (i % PER_DAY) + 1,
    props: { text: `第${String(i)}笔 · 槐花开了又谢，纸角记${pad(i)}号。` },
    createdAt: stamp,
    updatedAt: stamp,
  }
  if (card.kind === 'container' && i + 1 < CARD_TOTAL) {
    card.children = [`seed-${pad(i + 1)}` as CardId]
  }
  allCards.push(card)
}

const edges: EdgeRecord[] = []
const cardAt = (i: number): Card => {
  const c = allCards[i]
  if (c === undefined) throw new Error(`夹具下标越界 ${String(i)}`)
  return c
}
for (let e = 0; e < EDGE_TOTAL; e++) {
  // 密网分量：甲群 0..9999 与乙群 9000..18999 各半交叠缠 5000 根线（区间按 19800 顶格收口），0 号纸在网心。
  const a = cardAt((e * 2) % 10_000)
  const b = cardAt(9_000 + ((e * 7) % 10_000))
  edges.push({
    id: `seed-edge-${pad(e)}`,
    source: a.id,
    target: b.id,
    createdAt: a.createdAt,
    updatedAt: a.createdAt,
  })
}

const docs = new Map<string, Card[]>()
for (const c of allCards) {
  const day = dayOf(Number(c.id.slice(5)) % DAYS)
  const bucket = docs.get(day)
  if (bucket === undefined) docs.set(day, [c])
  else bucket.push(c)
}

let repo: Repo
let dbName = ''

describe('10× 规模证据（19800 卡 / 5000 边 / 1800 天 · 真缝宇宙 · 常跑不 skip）', () => {
  beforeAll(async () => {
    dbName = `banji-scale10-${String(Date.now())}`
    repo = await openRepo({ name: dbName })
    const journals: JournalDoc[] = [...docs.entries()].map(([date, cards]) => ({ date, cards, updatedAt: FIXED_NOW.toISOString() }))
    for (const d of journals) await repo.journals.put(d)
    for (const e of edges) await repo.edges.put(e)
  }, 180_000)

  afterAll(async () => {
    repo.close()
    if (dbName !== '') await deleteDatabase(dbName)
  })

  it('夹具落库规模 = 19800 卡 / 5000 边 / 1800 日（读侧经 BanjiApp 缝复秤）', async () => {
    const app = createBanjiApp(repo, { now: () => FIXED_NOW })
    expect(await app.loadAllCards()).toHaveLength(CARD_TOTAL)
    expect(await app.loadAllEdges()).toHaveLength(EDGE_TOTAL)
    expect(docs.size).toBe(DAYS)
    expect(new Set(docs.keys()).size).toBe(DAYS)
    for (const list of docs.values()) expect(list).toHaveLength(PER_DAY)
  }, 180_000)

  const timed = (label: string, budget: number, run: () => void): void => {
    run() // 热身一遍（JIT/首读落稳），计时读第二遍——与 R11 同法
    const t0 = performance.now()
    run()
    const ms = performance.now() - t0
    expect(ms, `${label} 越 R11 预算×4——热路径手术该议`).toBeLessThan(budget)
  }

  it('searchCards 万级语料 CJK 子串 < 200ms', async () => {
    const app = createBanjiApp(repo, { now: () => FIXED_NOW })
    const corpus = await app.loadAllCards()
    const meta = await app.loadAllAssetMeta()
    timed('searchCards(19800 卡, "槐花")', BUDGET_SEARCH_MS, () => {
      const hits = searchCards(corpus, meta, '槐花')
      if (hits.length !== 50) throw new Error(`cap=50 未兜住（${String(hits.length)}）`)
    })
  })

  it('graphLayout 全档案纸串 < 600ms', async () => {
    const app = createBanjiApp(repo, { now: () => FIXED_NOW })
    const corpus = await app.loadAllCards()
    const lines = await app.loadAllEdges()
    const entries: GraphEntry[] = corpus.map((row) => ({
      cardId: row.card.id,
      date: row.date,
      createdAt: row.card.createdAt,
      snippet: `第${row.card.id.slice(5)}笔`,
      icon: 'text',
      children: row.card.children ?? [],
    }))
    timed('graphLayout(19800 chips, 5000 边)', BUDGET_LAYOUT_MS, () => {
      const layout = graphLayout(entries, lines)
      if (layout.chips.length !== CARD_TOTAL) throw new Error('chip 数应≡卡数')
    })
  })

  it('threadOrder BFS 密网分量 < 600ms', async () => {
    const dateById = new Map<CardId, string>()
    for (const c of allCards) dateById.set(c.id, dayOf(Number(c.id.slice(5)) % DAYS))
    const start = allCards[0]?.id
    if (start === undefined) throw new Error('夹具首卡缺席')
    timed('threadOrder(5000 边分量)', BUDGET_BFS_MS, () => {
      const comp = threadOrder(start, edges, (id) => dateById.get(id) ?? '')
      if (comp.length < 2) throw new Error('分量只一颗珠——夹具坏了')
    })
  })

  it('exportArchive 全趟（GC+canonical JSON+zip 19800 卡）< 8s', async () => {
    const t0 = performance.now()
    const result = await exportArchive(repo, { now: () => FIXED_NOW })
    const ms = performance.now() - t0
    expect(result.ok).toBe(true)
    expect(ms, 'exportArchive 越预算×4——增量账本该议').toBeLessThan(BUDGET_EXPORT_MS)
  }, 120_000)
})
