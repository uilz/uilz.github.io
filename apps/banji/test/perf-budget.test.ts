// R11·D4 规模预算测——把「增量账本值不值得做」从口味之争变成数字之争：
// 2000 卡 / 600 边的真缝宇宙上，跑四条热路径（搜索内核、图布局、BFS 分量、导出 manifest 全趟），
// 预算宽裕（CI-safe）——目的钉死回归，不是压榨性能。任何一条越线才谈增量账本；全绿即债闭（见 ROUNDS D4 判定）。
// 底料经真应用层：repo.put 批量落文档（同一 schema 同一校验世界），读侧全走 BanjiApp 缝。
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteDatabase, openRepo } from '../src/repository/repo'
import type { Repo } from '../src/repository/types'
import { createBanjiApp } from '../src/application'
import { searchCards } from '../src/domain/search'
import { threadOrder } from '../src/domain/edges'
import { graphLayout, type GraphEntry } from '../src/ui/graphLayout'
import { exportArchive } from '../src/archive/exportArchive'
import type { Card, CardId, EdgeRecord, JournalDoc } from '../src/domain/types'

const DAYS = 200
const PER_DAY = 10
const CARD_TOTAL = DAYS * PER_DAY
const EDGE_TOTAL = 600

const BUDGET_SEARCH_MS = 50
const BUDGET_LAYOUT_MS = 150
const BUDGET_BFS_MS = 150
const BUDGET_EXPORT_MS = 2000

const FIXED_NOW = new Date(Date.UTC(2026, 7, 1, 12, 0, 0))

let repo: Repo
let dbNames: string[] = []
const openSeq = { n: 0 }

function pad(i: number): string {
  return String(i).padStart(4, '0')
}

function dayOf(i: number): string {
  const d = 1 + (i % 28)
  const m = 1 + Math.floor(i / 28) % 12
  const y = 2024 + Math.floor(i / (28 * 12))
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
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
  // 密网分量：800 个节点被 600 根线缠在一起（甲群 i ↔ 乙群 i+400），0 号纸必在网心。
  const a = cardAt(e % 400)
  const b = cardAt(400 + (e * 7) % 400)
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
  const day = dayOf(Number(c.id.slice(5)))
  const bucket = docs.get(day)
  if (bucket === undefined) docs.set(day, [c])
  else bucket.push(c)
}

beforeAll(async () => {
  const name = `banji-budget-${String(++openSeq.n)}-${String(Date.now())}`
  dbNames.push(name)
  repo = await openRepo({ name })
  const journals: JournalDoc[] = [...docs.entries()].map(([date, cards]) => ({
    date,
    cards,
    updatedAt: FIXED_NOW.toISOString(),
  }))
  for (const d of journals) await repo.journals.put(d)
  for (const e of edges) await repo.edges.put(e)
})

afterAll(async () => {
  repo.close()
  for (const n of dbNames) await deleteDatabase(n)
})

const timed = (label: string, budget: number, run: () => void): void => {
  run()
  const t0 = performance.now()
  run()
  const ms = performance.now() - t0
  console.log(`[D4] ${label}: ${ms.toFixed(1)}ms (预算 ${String(budget)}ms)`)
  expect(ms, `${label} 越预算线——增量账本该议`).toBeLessThan(budget)
}

describe('规模预算测（2000 卡 / 600 边 / 200 天 · 真缝宇宙）', () => {
  it('夹具落库规模 = 2000 卡 600 边（读侧全部经 BanjiApp 缝复秤）', async () => {
    const app = createBanjiApp(repo, { now: () => FIXED_NOW })
    const cards = await app.loadAllCards()
    const lines = await app.loadAllEdges()
    expect(cards).toHaveLength(CARD_TOTAL)
    expect(lines).toHaveLength(EDGE_TOTAL)
    expect(docs.size).toBeGreaterThanOrEqual(200)
  })

  it('searchCards 全量语料 CJK 子串 < 50ms', async () => {
    const app = createBanjiApp(repo, { now: () => FIXED_NOW })
    const corpus = await app.loadAllCards()
    const meta = await app.loadAllAssetMeta()
    timed('searchCards(2000 卡, "槐花")', BUDGET_SEARCH_MS, () => {
      const hits = searchCards(corpus, meta, '槐花')
      if (hits.length !== 50) throw new Error(`cap=50 未兜住（${String(hits.length)}）`)
    })
  })

  it('graphLayout 全档案纸串 < 150ms', async () => {
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
    timed('graphLayout(2000 chips, 600 边)', BUDGET_LAYOUT_MS, () => {
      const layout = graphLayout(entries, lines)
      if (layout.chips.length !== CARD_TOTAL) throw new Error('chip 数应≡卡数')
    })
  })

  it('threadOrder BFS 连通分量 < 150ms', async () => {
    const dateById = new Map<CardId, string>()
    for (const c of allCards) dateById.set(c.id, dayOf(Number(c.id.slice(5))))
    const start = allCards[0]?.id
    if (start === undefined) throw new Error('夹具首卡缺席')
    timed('threadOrder(600 边分量)', BUDGET_BFS_MS, () => {
      const comp = threadOrder(start, edges, (id) => dateById.get(id) ?? '')
      if (comp.length < 2) throw new Error('分量只一颗珠——夹具坏了')
    })
  })

  it('exportArchive manifest 全趟（含 GC 选择器与 canonical JSON）< 2s', async () => {
    const t0 = performance.now()
    const result = await exportArchive(repo, { now: () => FIXED_NOW })
    const ms = performance.now() - t0
    console.log(`[D4] exportArchive 全趟: ${ms.toFixed(1)}ms (预算 ${String(BUDGET_EXPORT_MS)}ms)`)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.zip.byteLength).toBeGreaterThan(1000)
    expect(ms, 'exportArchive 越预算线——增量账本该议').toBeLessThan(BUDGET_EXPORT_MS)
  })
})
