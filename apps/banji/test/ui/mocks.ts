// UI 测试的边界 = BanjiApp 缝：内存假实现，零 IndexedDB。
// 假得诚实：update/move/resize/delete 真的改内存文档，级联走 domain/gc 同一套纯函数。
import { vi } from 'vitest'
import { hashBlob } from '../../src/archive/hash'
import type {
  AssetInput,
  AssetRecord,
  BanjiApp,
  Card,
  CardAt,
  CardId,
  CardPatch,
  DeleteSnapshot,
  EdgeRecord,
  ExportFileResult,
  ImportResult,
  JournalDoc,
  MonthMark,
  NewCardInput,
  RecentCard,
} from '../../src/application'
import { cardsByIdOf, collectCardHashRefs, collectSubtreeIds } from '../../src/domain/gc'
import { edgesTouching } from '../../src/domain/edges'
import { addDays } from '../../src/domain/date'

export interface MockSeam {
  readonly app: BanjiApp
  readonly journals: Map<string, JournalDoc>
  readonly assets: Map<string, AssetRecord>
  readonly edges: Map<string, EdgeRecord>
  readonly settings: Map<string, unknown>
  putDay(date: string, cards: Card[]): void
  putEdge(edge: EdgeRecord): void
}

let cardSeq = 0
let edgeSeq = 0
const iso = (): string => new Date(0).toISOString()

export function makeMockApp(): MockSeam {
  const journals = new Map<string, JournalDoc>()
  const assets = new Map<string, AssetRecord>()
  const edges = new Map<string, EdgeRecord>()
  const settings = new Map<string, unknown>()

  const rewrite = (date: string, fn: (cards: Card[]) => Card[]): void => {
    const doc = journals.get(date)
    journals.set(date, { date, cards: fn(doc?.cards ?? []), updatedAt: iso() })
  }
  const oneCard = (date: string, id: CardId, fn: (c: Card) => Card): Card => {
    const found = journals.get(date)?.cards.find((c) => c.id === id)
    if (found === undefined) throw new Error(`mock: 卡片不存在 ${date}/${id}`)
    const next = fn(found)
    rewrite(date, (cards) => cards.map((c) => (c.id === id ? next : c)))
    return next
  }

  const app: BanjiApp = {
    getMonth: vi.fn(async (y: number, m: number): Promise<string[]> =>
      (await app.getMonthSummary(y, m)).map((r) => r.date),
    ),
    getMonthSummary: vi.fn(async (y: number, m: number): Promise<MonthMark[]> => {
      const prefix = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`
      return [...journals.values()]
        .filter((d) => d.date.startsWith(prefix) && d.cards.length > 0)
        .map((d) => ({ date: d.date, cardCount: d.cards.length }))
        .sort((a, b) => (a.date < b.date ? -1 : 1))
    }),
    getJournal: vi.fn(async (date: string) => journals.get(date)),
    addCard: vi.fn(async (date: string, draft: NewCardInput): Promise<Card> => {
      const card: Card = {
        id: `mock-c${String(++cardSeq)}` as CardId,
        kind: draft.kind,
        pos: draft.pos ?? { x: 0, y: 0 },
        size: draft.size ?? { w: 320, h: 200 },
        props: structuredClone(draft.props),
        createdAt: iso(),
        updatedAt: iso(),
        ...(draft.z === undefined ? {} : { z: draft.z }),
        ...(draft.children === undefined ? {} : { children: [...draft.children] }),
      }
      rewrite(date, (cards) => [...cards, card])
      return card
    }),
    updateCard: vi.fn(async (date: string, id: CardId, patch: CardPatch): Promise<Card> => oneCard(date, id, (c) => ({ ...c, ...patch, id: c.id, createdAt: c.createdAt }))),
    moveCard: vi.fn(async (date: string, id: CardId, pos: { x: number; y: number }): Promise<Card> => oneCard(date, id, (c) => ({ ...c, pos }))),
    resizeCard: vi.fn(async (date: string, id: CardId, size: { w: number; h: number }): Promise<Card> => oneCard(date, id, (c) => ({ ...c, size }))),
    deleteCardCascade: vi.fn(async (date: string, id: CardId): Promise<EdgeRecord[]> => {
      const doc = journals.get(date)
      if (doc === undefined) throw new Error(`mock: 无日志 ${date}`)
      const doomed = collectSubtreeIds(cardsByIdOf(doc.cards), id)
      rewrite(date, (cards) => cards.filter((c) => !doomed.has(c.id)))
      const doomedEdges = edgesTouching([...edges.values()], doomed)
      for (const e of doomedEdges) edges.delete(e.id)
      return doomedEdges.map((e) => structuredClone(e))
    }),
    restoreCards: vi.fn(async (date: string, snapshot: DeleteSnapshot): Promise<void> => {
      let cards = [...(journals.get(date)?.cards ?? [])]
      for (const card of structuredClone(snapshot.cards)) {
        if (cards.some((c) => c.id === card.id)) continue
        cards.push(card)
      }
      for (const patch of snapshot.parentPatches) {
        if (!cards.some((c) => c.id === patch.parentId)) continue
        cards = cards.map((c) => {
          if (c.id !== patch.parentId) return c
          const children = c.children ?? []
          if (children.includes(patch.childId)) return c
          const next = [...children]
          next.splice(Math.max(0, Math.min(next.length, Math.trunc(patch.index))), 0, patch.childId)
          return { ...c, children: next }
        })
      }
      journals.set(date, { date, cards, updatedAt: iso() })
      for (const edge of snapshot.edgePatches ?? []) {
        if (!edges.has(edge.id)) edges.set(edge.id, structuredClone(edge))
      }
    }),
    addEdge: vi.fn(async (source: CardId, target: CardId): Promise<EdgeRecord | null> => {
      if (source === target) return null
      const live = new Set([...journals.values()].flatMap((d) => d.cards.map((c) => c.id)))
      if (!live.has(source) || !live.has(target)) return null
      const linked = [...edges.values()]
      if (linked.some((e) => (e.source === source && e.target === target) || (e.source === target && e.target === source))) return null
      const edge: EdgeRecord = { id: `mock-e${String(++edgeSeq)}`, source, target, createdAt: iso(), updatedAt: iso() }
      edges.set(edge.id, edge)
      return edge
    }),
    deleteEdge: vi.fn(async (id: string): Promise<void> => {
      edges.delete(id)
    }),
    listEdgesForCards: vi.fn(async (ids: readonly CardId[]): Promise<EdgeRecord[]> => {
      const set = new Set(ids)
      return edgesTouching([...edges.values()], set).sort((a, b) => (a.id < b.id ? -1 : 1))
    }),
    getRecentCards: vi.fn(async (anchor: string, days: number): Promise<RecentCard[]> => {
      const floor = addDays(anchor, -days)
      const out: RecentCard[] = []
      for (const d of journals.values()) {
        if (d.date < floor || d.date >= anchor) continue
        for (const card of d.cards) {
          if (card.kind === 'container') continue
          const hash = [...collectCardHashRefs(card.props)][0]
          const name = hash === undefined ? undefined : assets.get(hash)?.name
          out.push({ date: d.date, card, ...(name === undefined ? {} : { assetName: name }) })
        }
      }
      return out.sort((a, b) => (a.date === b.date ? (a.card.createdAt < b.card.createdAt ? -1 : 1) : a.date < b.date ? 1 : -1))
    }),
    loadAllCards: vi.fn(async (): Promise<CardAt[]> =>
      [...journals.values()]
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .flatMap((d) => d.cards.map((card) => ({ date: d.date, card }))),
    ),
    loadAllEdges: vi.fn(async (): Promise<EdgeRecord[]> => [...edges.values()].sort((a, b) => (a.id < b.id ? -1 : 1))),
    addAsset: vi.fn(async (file: AssetInput): Promise<AssetRecord> => {
      const hash = await hashBlob(file)
      const found = assets.get(hash)
      if (found !== undefined) return found
      const rec: AssetRecord = {
        hash,
        mime: file.type === undefined || file.type === '' ? 'application/octet-stream' : file.type,
        size: file.size,
        addedAt: iso(),
        blob: file,
        ...(file.name === undefined ? {} : { name: file.name }),
      }
      assets.set(hash, rec)
      return rec
    }),
    getAsset: vi.fn(async (hash: string) => assets.get(hash)),
    getSetting: vi.fn(async (key: string) => settings.get(key)),
    setSetting: vi.fn(async (key: string, value: unknown) => {
      settings.set(key, value)
    }),
    exportToFile: vi.fn(async (): Promise<ExportFileResult> => ({
      filename: 'mock.banjizip',
      archive: { ok: true, zip: new Uint8Array(0) },
    })),
    importFromFile: vi.fn(async (): Promise<ImportResult> => ({
      ok: true,
      stats: { journals: journals.size, cards: 0, edges: 0, settings: 0, assets: 0 },
    })),
    close: vi.fn(),
  }

  return {
    app,
    journals,
    assets,
    edges,
    settings,
    putDay(date, cards) {
      journals.set(date, { date, cards, updatedAt: iso() })
    },
    putEdge(edge) {
      edges.set(edge.id, edge)
    },
  }
}
