// 应用层：UI 单元消费的唯一用例入口。薄——只做“取文档 → 改卡片 → 戳 updatedAt → 写回”
// 的编排，零 React/DOM 依赖（importFromFile 收 Blob 只因 File 天然继承它）。
// 表单级校验属 UI 边界：直接用 domain/validate 的同一套纯校验器。
import type { AssetRecord, Card, CardId, CardKind, CardPos, CardSize, JournalDoc } from '../domain/types'
import { newCardId } from '../domain/id'
import { isValidDateString } from '../domain/date'
import { cardsByIdOf, collectSubtreeIds } from '../domain/gc'
import { hashBlob } from '../archive/hash'
import type { Repo } from '../repository/types'
import { exportArchive, type ExportResult } from '../archive/exportArchive'
import { importArchive, type ImportArchiveOptions, type ImportResult } from '../archive/importArchive'
import type { SchemaMigration } from '../archive/migration'

export type { AssetRecord, Card, CardId, CardKind, JournalDoc }
export { isValidDateString, monthMatrix, monthOf, todayLocal, addDays } from '../domain/date'
export { newCardId } from '../domain/id'
export type { ExportResult, ImportResult }

export interface NewCardInput {
  readonly kind: CardKind
  readonly props: unknown
  readonly pos?: CardPos
  readonly size?: CardSize
  readonly z?: number
  readonly rot?: number
  readonly children?: readonly CardId[]
  readonly meta?: Record<string, unknown>
}

/** 除身份与出生时间外全部可改；kind/props 可一起换（卡片性质改造是合法操作）。 */
export type CardPatch = Partial<Omit<Card, 'id' | 'createdAt'>>

export interface ExportFileResult {
  readonly filename: string
  readonly archive: ExportResult
}

export class InvalidDateError extends Error {
  constructor(readonly date: string) {
    super(`非法日期字符串（须 YYYY-MM-DD）: ${JSON.stringify(date)}`)
    this.name = 'InvalidDateError'
  }
}

export class JournalNotFoundError extends Error {
  constructor(readonly date: string) {
    super(`该日期还没有日志: ${date}`)
    this.name = 'JournalNotFoundError'
  }
}

export class CardNotFoundError extends Error {
  constructor(
    readonly date: string,
    readonly id: CardId,
  ) {
    super(`卡片不存在: ${date} / ${String(id)}`)
    this.name = 'CardNotFoundError'
  }
}

export interface AppOptions {
  readonly now?: () => Date
  readonly migrationTable?: readonly SchemaMigration[]
}

/** 月历打点：某日有内容的卡片数（墨点分层用）。 */
export interface MonthMark {
  readonly date: string
  readonly cardCount: number
}

/** File 即 Blob+名字；type 缺省时落 application/octet-stream。 */
export type AssetInput = Blob & { readonly name?: string; readonly type?: string }

export interface BanjiApp {
  /** 当月“有内容”的日期（该日 journal.cards 非空），升序 'YYYY-MM-DD'。月历打点用。 */
  getMonth(year: number, month: number): Promise<string[]>
  /** 同 getMonth 的口径，但带上每日卡片数（月历墨点分层）。 */
  getMonthSummary(year: number, month: number): Promise<MonthMark[]>
  getJournal(date: string): Promise<JournalDoc | undefined>
  /** 当天无文档则自动创建；返回写入后的卡片（id/时间戳已填充）。 */
  addCard(date: string, draft: NewCardInput): Promise<Card>
  updateCard(date: string, id: CardId, patch: CardPatch): Promise<Card>
  moveCard(date: string, id: CardId, pos: CardPos): Promise<Card>
  resizeCard(date: string, id: CardId, size: CardSize): Promise<Card>
  /** 容器级联删除整棵子树；资产永不自动删除（GC 只发生在导出环节）。 */
  deleteCardCascade(date: string, id: CardId): Promise<void>
  /** 不落库的文件字节 → assets store（内容寻址 sha256；同字节复用既有记录，改名不去重失效）。 */
  addAsset(file: AssetInput): Promise<AssetRecord>
  getAsset(hash: string): Promise<AssetRecord | undefined>
  getSetting(key: string): Promise<unknown>
  setSetting(key: string, value: unknown): Promise<void>
  /** 不碰 DOM：返回字节+建议文件名，下载由 UI 层完成。 */
  exportToFile(): Promise<ExportFileResult>
  importFromFile(source: Blob | Uint8Array, opts?: Pick<ImportArchiveOptions, 'estimate' | 'batchLimit'>): Promise<ImportResult>
  close(): void
}

const DEFAULT_POS: CardPos = { x: 0, y: 0 }
const DEFAULT_SIZE: CardSize = { w: 320, h: 200 }

function requireDate(date: string): void {
  if (!isValidDateString(date)) throw new InvalidDateError(date)
}

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

  const getDocOrThrow = async (date: string): Promise<JournalDoc> => {
    requireDate(date)
    const doc = await repo.journals.get(date)
    if (doc === undefined) throw new JournalNotFoundError(date)
    return doc
  }

  const patchCard = async (date: string, id: CardId, fn: (card: Card) => Card): Promise<Card> => {
    const doc = await getDocOrThrow(date)
    let found: Card | undefined
    const cards = doc.cards.map((card) => {
      if (card.id !== id) return card
      found = fn(card)
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
    updateCard: (date, id, patch) =>
      patchCard(date, id, (card) => ({ ...card, ...patch, id: card.id, createdAt: card.createdAt, updatedAt: stamp() })),
    moveCard: (date, id, pos) => patchCard(date, id, (card) => ({ ...card, pos, updatedAt: stamp() })),
    resizeCard: (date, id, size) => patchCard(date, id, (card) => ({ ...card, size, updatedAt: stamp() })),
    async deleteCardCascade(date, id) {
      const doc = await getDocOrThrow(date)
      const byId = cardsByIdOf(doc.cards)
      if (!byId.has(id)) throw new CardNotFoundError(date, id)
      const doomed = collectSubtreeIds(byId, id)
      await repo.journals.put({ ...doc, cards: doc.cards.filter((c) => !doomed.has(c.id)), updatedAt: stamp() })
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
      })
    },
    close: () => repo.close(),
  }
}
