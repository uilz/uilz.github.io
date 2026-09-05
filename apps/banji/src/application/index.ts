// 应用层：UI 单元消费的唯一用例入口。薄——只做“取文档 → 改卡片 → 戳 updatedAt → 写回”
// 的编排，零 React/DOM 依赖（importFromFile 收 Blob 只因 File 天然继承它）。
// R7 拆分：契约类型与错误住 ./types，关系缝与删除-恢复的边端编排住 ./edgeCases（守 250 纯行天花板）。
import type { AssetRecord, Card, CardId, JournalDoc } from '../domain/types'
import type { AssetMeta } from '../domain/search'
import { isValidDateString } from '../domain/date'
import { newCardId } from '../domain/id'
import { hashBlob } from '../archive/hash'
import type { CommitGate, Repo } from '../repository/types'
import { exportArchive } from '../archive/exportArchive'
import { importArchive } from '../archive/importArchive'
import { CardNotFoundError, JournalNotFoundError, requireDate } from './types'
import type { AppOptions, BanjiApp, CardPatch, NewCardInput } from './types'
import {
  addEdge,
  deleteCardCascade,
  deleteEdge,
  getRecentCards,
  listEdgesForCards,
  loadAllCards,
  loadAllEdges,
  restoreCards,
} from './edgeCases'

export * from './types'
export type { AssetRecord, Card, CardId, CardKind, EdgeRecord, JournalDoc } from '../domain/types'
export type { AssetMeta } from '../domain/search'
export { isValidDateString, monthMatrix, monthOf, todayLocal, addDays } from '../domain/date'
export { newCardId, newEdgeId } from '../domain/id'
export type { ExportResult } from '../archive/exportArchive'
export type { ImportResult } from '../archive/importArchive'
export type { CommitGate } from '../repository/types'

const DEFAULT_POS: { x: number; y: number } = { x: 0, y: 0 }
const DEFAULT_SIZE: { w: number; h: number } = { w: 320, h: 200 }

function cardFromDraft(draft: NewCardInput, stamp: string): Card {
  const card: Card = {
    id: newCardId(),
    kind: draft.kind,
    pos: draft.pos ?? DEFAULT_POS,
    size: draft.size ?? DEFAULT_SIZE,
    props: structuredClone(draft.props),
    createdAt: stamp,
    updatedAt: stamp,
  }
  if (draft.children !== undefined) card.children = [...draft.children]
  if (draft.meta !== undefined) card.meta = structuredClone(draft.meta)
  if (draft.z !== undefined) card.z = draft.z
  if (draft.rot !== undefined) card.rot = draft.rot
  return card
}

export function createBanjiApp(repo: Repo, opts: AppOptions = {}): BanjiApp {
  const stamp = (): string => (opts.now === undefined ? new Date() : opts.now()).toISOString()
  // R10·债#5：链上 commit 的执行权在持链者手里（每枚 createBanjiApp 各持各的门，互不串门）。
  let commitGate: CommitGate | null = null

  const getDocOrThrow = async (date: string): Promise<JournalDoc> => {
    requireDate(date)
    const doc = await repo.journals.get(date)
    if (doc === undefined) throw new JournalNotFoundError(date)
    return doc
  }

  const patchCard = async (date: string, id: CardId, patch: CardPatch): Promise<Card> => {
    const doc = await getDocOrThrow(date)
    let found: Card | undefined
    const cards = doc.cards.map((card) => {
      if (card.id !== id) return card
      found = { ...card, ...patch, id: card.id, createdAt: card.createdAt, updatedAt: stamp() }
      return found
    })
    if (found === undefined) throw new CardNotFoundError(date, id)
    await repo.journals.put({ ...doc, cards, updatedAt: stamp() })
    return found
  }

  return {
    async getMonth(year, month) {
      const prefix = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`
      const all = await repo.journals.list()
      return all
        .filter((d) => d.date.startsWith(prefix) && d.cards.length > 0)
        .map((d) => d.date)
        .sort()
    },
    async getMonthSummary(year, month) {
      const prefix = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`
      const all = await repo.journals.list()
      return all
        .filter((d) => d.date.startsWith(prefix) && d.cards.length > 0)
        .map((d) => ({ date: d.date, cardCount: d.cards.length }))
        .sort((a, b) => (a.date < b.date ? -1 : 1))
    },
    async getJournal(date) {
      requireDate(date)
      return repo.journals.get(date)
    },
    async addCard(date, draft) {
      requireDate(date)
      const card = cardFromDraft(draft, stamp())
      const doc = await repo.journals.get(date)
      const cards = doc === undefined ? [card] : [...doc.cards, card]
      await repo.journals.put({ date, cards, updatedAt: stamp() })
      return card
    },
    updateCard: (date, id, patch) => patchCard(date, id, patch),
    moveCard: (date, id, pos) => patchCard(date, id, { pos }),
    resizeCard: (date, id, size) => patchCard(date, id, { size }),
    deleteCardCascade: (date, id) => deleteCardCascade(repo, stamp, date, id),
    restoreCards: (date, snapshot) => restoreCards(repo, stamp, date, snapshot),
    addEdge: (source, target) => addEdge(repo, stamp, source, target),
    deleteEdge: (id) => deleteEdge(repo, id),
    listEdgesForCards: (ids) => listEdgesForCards(repo, ids),
    getRecentCards: (anchor, days) => getRecentCards(repo, anchor, days),
    loadAllCards: () => loadAllCards(repo),
    loadAllEdges: () => loadAllEdges(repo),
    // IDB 递来整条记录；过缝第一刻就剥成元数据投影——blob 引用绝不下到 UI 层。
    async loadAllAssetMeta() {
      return (await repo.assets.list()).map((a): AssetMeta => ({
        hash: a.hash,
        mime: a.mime,
        size: a.size,
        ...(a.name === undefined ? {} : { name: a.name }),
      }))
    },
    async addAsset(file) {
      const hash = await hashBlob(file)
      const existing = await repo.assets.get(hash)
      if (existing !== undefined) return existing
      const record: AssetRecord = {
        hash,
        mime: file.type === '' ? 'application/octet-stream' : file.type,
        size: file.size,
        addedAt: stamp(),
        blob: file,
      }
      if (file.name !== undefined) record.name = file.name
      await repo.assets.put(record)
      return record
    },
    getAsset: (hash) => repo.assets.get(hash),
    async getSetting(key) {
      const rec = await repo.settings.get(key)
      return rec?.value
    },
    async setSetting(key, value) {
      await repo.settings.put({ key, value, updatedAt: stamp() })
    },
    async exportToFile() {
      const day = stamp().slice(0, 10)
      const archive = await exportArchive(repo, opts.now === undefined ? {} : { now: opts.now })
      return { filename: `banji-${day}.banjizip`, archive }
    },
    async importFromFile(source, importOpts) {
      const zip = source instanceof Uint8Array ? source : new Uint8Array(await source.arrayBuffer())
      return importArchive(zip, {
        repo,
        ...(opts.migrationTable === undefined ? {} : { migrationTable: opts.migrationTable }),
        ...(importOpts?.estimate === undefined ? {} : { estimate: importOpts.estimate }),
        ...(importOpts?.batchLimit === undefined ? {} : { batchLimit: importOpts.batchLimit }),
        // 每次调用现摘门（注册/交还未落地也拿得到最新态）：无头 = 直通，与注册前一字不差。
        commitGate: (task) => (commitGate === null ? task() : commitGate(task)),
      })
    },
    setCommitGate(gate) {
      commitGate = gate
    },
    close: () => repo.close(),
  }
}
