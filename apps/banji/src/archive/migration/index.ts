// 单一迁移注册表（契约 §7）：migrateArchive 与 repository 的 onupgradeneeded 共用同一张表。
// 本模块零 I/O：记录转换是纯 unknown→unknown；store 拓扑以声明式规格描述、由 repository 解释执行。
// 产品文案约束：拒绝消息必须让用户读得出“数据还在、更新伴记即可”，绝不可像“日记没了”。

import type { ArchiveAssetIndexEntry } from '../format'

export const ARCHIVE_SCHEMA_CURRENT = 1

export interface RecordTransforms {
  readonly journals?: (raw: unknown) => unknown
  readonly edges?: (raw: unknown) => unknown
  readonly settings?: (raw: unknown) => unknown
  /** 仅作用于归档 manifest.assets 条目（JSON 形态）。 */
  readonly assetIndex?: (raw: unknown) => unknown
  /** 仅作用于 IDB assets store 的 AssetRecord（带 blob），只能做不动 blob 的字段变形；
   * 需要重算 hash 的算法级变更不走此通道（由导入重建）。archive 侧恒为透传。 */
  readonly assetRecords?: (raw: unknown) => unknown
}

export interface StoreSpec {
  readonly name: string
  readonly keyPath?: string
  readonly indexes?: readonly { readonly name: string; readonly keyPath: string }[]
}

export interface MigrationTopology {
  readonly createStores?: readonly StoreSpec[]
}

export interface SchemaMigration {
  readonly from: number
  readonly to: number
  readonly topology?: MigrationTopology
  readonly records?: RecordTransforms
}

/** v1：无历史包袱，表为空。未来版本按 from→to append；to 必须等于 from+1，永不改写旧行。 */
export const MIGRATIONS: readonly SchemaMigration[] = []

export type ArchiveRejectCode = 'archive_too_new' | 'unknown_hash_algo' | 'archive_shape' | 'migration_chain_broken'

export class ArchiveRejectedError extends Error {
  constructor(
    readonly code: ArchiveRejectCode,
    readonly userMessage: string,
    detail: string,
  ) {
    super(`[${code}] ${detail}`)
    this.name = 'ArchiveRejectedError'
  }
}

export const rejectedTooNew = (found: number): ArchiveRejectedError =>
  new ArchiveRejectedError('archive_too_new', '此档案来自更新版本的伴记，请更新伴记后再导入（你的日记数据完好无损）。', `schemaVersion=${String(found)} > CURRENT=${String(ARCHIVE_SCHEMA_CURRENT)}`)

export const rejectedUnknownAlgo = (found: string): ArchiveRejectedError =>
  new ArchiveRejectedError('unknown_hash_algo', '此档案使用了当前版本伴记无法校验的指纹算法。为保护内容不被误读，导入已中止；你的现有日记完好，升级伴记后即可再次尝试。', `hashAlgo=${found}`)

const rejectedShape = (detail: string): ArchiveRejectedError =>
  new ArchiveRejectedError('archive_shape', '此档案的结构无法被当前版本伴记读取，导入已中止。你的现有日记完好；如有旧版备份，可用旧版伴记打开。', detail)

const rejectedChain = (detail: string): ArchiveRejectedError =>
  new ArchiveRejectedError('migration_chain_broken', '当前版本伴记无法把此档案升级到最新格式，导入已中止。你的现有日记完好，请更新伴记后重试。', detail)

/** 两道闸：schemaVersion ∈ [1, CURRENT]，hashAlgo 冻结为 sha256。 */
export function checkArchiveGates(schemaVersion: unknown, hashAlgo: unknown): void {
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion) || schemaVersion < 1) {
    throw rejectedShape(`schemaVersion 非法: ${JSON.stringify(schemaVersion)}`)
  }
  if (schemaVersion > ARCHIVE_SCHEMA_CURRENT) throw rejectedTooNew(schemaVersion)
  if (hashAlgo !== 'sha256') throw rejectedUnknownAlgo(String(hashAlgo))
}

export interface ArchiveRecordSets {
  journalDocs: readonly unknown[]
  edges: readonly unknown[]
  settings: readonly unknown[]
  assetIndex: readonly unknown[]
}

export interface MigratedArchive extends ArchiveRecordSets {
  readonly schemaVersion: number
}

function hopTransform(m: SchemaMigration, sets: ArchiveRecordSets): ArchiveRecordSets {
  const map = (fn: ((raw: unknown) => unknown) | undefined, xs: readonly unknown[]): readonly unknown[] =>
    fn === undefined ? xs : xs.map((x) => fn(structuredClone(x)))
  return {
    journalDocs: map(m.records?.journals, sets.journalDocs),
    edges: map(m.records?.edges, sets.edges),
    settings: map(m.records?.settings, sets.settings),
    assetIndex: map(m.records?.assetIndex, sets.assetIndex),
  }
}

/**
 * 纯、全函数：沿注册表逐跳把记录集合提升到 CURRENT。
 * from==CURRENT 时输出与输入 deep-equal（恒等性）。输入必须先过 checkArchiveGates。
 */
export function migrateRecords(from: number, sets: ArchiveRecordSets, table: readonly SchemaMigration[] = MIGRATIONS): MigratedArchive {
  if (!Number.isInteger(from) || from < 1) throw rejectedShape(`schemaVersion=${String(from)} 低于最低兼容版本 1`)
  if (from > ARCHIVE_SCHEMA_CURRENT) throw rejectedTooNew(from)
  const cloned: ArchiveRecordSets = {
    journalDocs: sets.journalDocs.map((x) => structuredClone(x)),
    edges: sets.edges.map((x) => structuredClone(x)),
    settings: sets.settings.map((x) => structuredClone(x)),
    assetIndex: sets.assetIndex.map((x) => structuredClone(x)),
  }
  let cur = from
  let out = cloned
  while (cur < ARCHIVE_SCHEMA_CURRENT) {
    const hop = table.find((m) => m.from === cur)
    if (hop === undefined) {
      throw rejectedChain(`迁移链缺少 ${String(cur)}→${String(cur + 1)} 转换`)
    }
    if (hop.to === cur) throw rejectedChain(`迁移表存在自环 ${String(cur)}→${String(cur)}`)
    out = hopTransform(hop, out)
    cur = hop.to
  }
  return { schemaVersion: cur, journalDocs: out.journalDocs, edges: out.edges, settings: out.settings, assetIndex: out.assetIndex }
}

export interface MigratableArchive extends ArchiveRecordSets {
  readonly schemaVersion: number
}

/** 归档级门面。注入超前于 CURRENT 的迁移表属于开发期错误，显式拒绝。 */
export function migrateArchive(archive: MigratableArchive, table: readonly SchemaMigration[] = MIGRATIONS): MigratedArchive {
  const r = migrateRecords(archive.schemaVersion, archive, table)
  if (r.schemaVersion > ARCHIVE_SCHEMA_CURRENT) {
    throw rejectedChain(`注册表把记录提升到了 ${String(r.schemaVersion)}，超出当前支持上限 ${String(ARCHIVE_SCHEMA_CURRENT)}`)
  }
  return r
}

/** 归档 manifest.assets 条目的便捷类型别名（迁移签名收 unknown，实际项形状见 format.ts）。 */
export type { ArchiveAssetIndexEntry }
