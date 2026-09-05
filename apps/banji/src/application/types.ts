// 应用层的对外契约：类型、错误与缝的形状。实现分在两处——
// index.ts（卡片/资产/设置的日常编排）与 edgeCases.ts（关系缝 + 删除-恢复的边端联动）；
// UI 与测试只认 '../application' 这一只桶。
import type { AssetRecord, Card, CardId, CardKind, CardPos, CardSize, EdgeRecord, JournalDoc } from '../domain/types'
import { isValidDateString } from '../domain/date'
import type { AssetMeta } from '../domain/search'
import type { ValidationIssue } from '../domain/validate'
import type { SchemaMigration } from '../archive/migration'
import type { ImportArchiveOptions, ImportResult } from '../archive/importArchive'
import type { CommitGate } from '../repository/types'
import type { ExportResult } from '../archive/exportArchive'

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

/** undo 恢复时快照未过校验（理论上不该发生，UI 侧构造，纯防御）。 */
export class InvalidRestoreError extends Error {
  constructor(
    readonly date: string,
    readonly issues: readonly ValidationIssue[],
  ) {
    super(`恢复快照校验失败: ${date}; ${issues.map((i) => i.message).join(' | ')}`)
    this.name = 'InvalidRestoreError'
  }
}

export function requireDate(date: string): void {
  if (!isValidDateString(date)) throw new InvalidDateError(date)
}

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

/** 月历打点：某日有内容的卡片数（墨点分层用）。 */
export interface MonthMark {
  readonly date: string
  readonly cardCount: number
}

/** File 即 Blob+名字；type 缺省时落 application/octet-stream。 */
export type AssetInput = Blob & { readonly name?: string; readonly type?: string }

/** 删除撤销的完整快照：撕下的卡片群 + 幸存 children 悬空引用的原位记录 + 触及级联集的边逐字副本。 */
export interface DeleteSnapshot {
  /** 被删卡片的逐字副本：ids、createdAt/updatedAt、props、children、pos、size、z、meta —— 恢复时一件不重生。 */
  readonly cards: readonly Card[]
  /** 被幸存卡片 children[] 引用过的被删卡：undo 时按记录 index 重插入（越界则钳制）。 */
  readonly parentPatches: readonly ParentPatch[]
  /** R7·D4：级联同批剪掉、触及被删子树的边。恢复按原 id 逐字重插（库中已存在者跳过=双次幂等）。字段可选——R4-R6 的既有构造点与快照不带边。 */
  readonly edgePatches?: readonly EdgeRecord[]
}

export interface ParentPatch {
  readonly parentId: CardId
  readonly childId: CardId
  readonly index: number
}

/** 一张纸落在哪一天（卡片无 date 字段：文档键即归属）。 */
export interface CardAt {
  readonly date: string
  readonly card: Card
}

/** 「牵给近日…」的候选：日子 + 卡片本体 +（附件卡时）入库文件名。 */
export interface RecentCard extends CardAt {
  readonly assetName?: string
}

export interface AppOptions {
  readonly now?: () => Date
  readonly migrationTable?: readonly SchemaMigration[]
}

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
  /** 撕下：级联删除整棵子树，同一提交批内剪掉触及子树的全部边（D4，跨日边也剪）；返回被剪边的逐字副本供 undo 快照。 */
  deleteCardCascade(date: string, id: CardId): Promise<EdgeRecord[]>
  /** 删除撤销：快照逐字写回（无文档则建；id 已存在者跳过不重复），parentPatches 按原 index 重插，edgePatches 按原 id 重插，只 bump 文档 updatedAt。 */
  restoreCards(date: string, snapshot: DeleteSnapshot): Promise<void>
  /** 牵线（R7）：同对卡任一方向已有线、自牵、端点无卡 → null（静默拒——role 休眠期一根线就够）；成功返回落库的边。 */
  addEdge(source: CardId, target: CardId): Promise<EdgeRecord | null>
  /** 撕线：按 id 摘边；不存在即幂等静默。 */
  deleteEdge(id: string): Promise<void>
  /** 同日渲染的取数：触及给定卡片的边（两向并集、按 id 去重定序）。 */
  listEdgesForCards(ids: readonly CardId[]): Promise<EdgeRecord[]>
  /** 「牵给近日」候选：严格早于 anchor、回看 days 天的非垫纸；新日在前；附资产名。 */
  getRecentCards(anchor: string, days: number): Promise<RecentCard[]>
  /** 线模式 BFS 的底料：全部日期的全部卡片，按日期升序。 */
  loadAllCards(): Promise<CardAt[]>
  /** 线模式 BFS 的另一半：全量边。千级全扫是档案尺度的读，可负担（任务书 D5）。 */
  loadAllEdges(): Promise<EdgeRecord[]>
  /** R8·D2 全局搜索的底料：全量资产元数据投影。返回记录**绝不含 blob**（blob 不过缝）。 */
  loadAllAssetMeta(): Promise<AssetMeta[]>
  /** 不落库的文件字节 → assets store（内容寻址 sha256；同字节复用既有记录，改名不去重失效）。 */
  addAsset(file: AssetInput): Promise<AssetRecord>
  getAsset(hash: string): Promise<AssetRecord | undefined>
  getSetting(key: string): Promise<unknown>
  setSetting(key: string, value: unknown): Promise<void>
  /** 不碰 DOM：返回字节+建议文件名，下载由 UI 层完成。 */
  exportToFile(): Promise<ExportFileResult>
  importFromFile(source: Blob | Uint8Array, opts?: Pick<ImportArchiveOptions, 'estimate' | 'batchLimit'>): Promise<ImportResult>
  /**
   * R10·债#5 提交门注册：持串行链的宿主（UI 唯一中介）挂载时注入「commit 排我这条链」的执行权，
   * 抽屉与任何无头调用者共用 importFromFile 同一扇门、同一重屏障保证。null/未注册 = 直通立即提交。
   */
  setCommitGate(gate: CommitGate | null): void
  close(): void
}
