import type { StagingKey } from '../domain/types'
import type { StagedEntry } from '../repository/types'
import { isValidDateString } from '../domain/date'
import { collectCardHashRefs } from '../domain/gc'
import { readCard, validateArchiveSetting, validateEdge, validateJournalDoc } from '../domain/validate'
import { ArchiveRejectedError, checkArchiveGates, migrateArchive, type ArchiveRecordSets, type SchemaMigration } from './migration'
import { narrowAssetEntry, type ArchiveAssetIndexEntry } from './format'

// 导入预检（阶段 1，纯内存、零写盘）。产出物 = 将要写入的完整分批清单（Plan）。
// 预检不通过 ⇒ Plan 不存在 ⇒ 写盘代码路径无从执行——“失败不动现有数据”由结构保证。

export type PreflightCode =
  | 'archive_gate'
  | 'json.unparsable'
  | 'journal.invalid'
  | 'journal.duplicate_date'
  | 'card.duplicate_id'
  | 'card.dangling_asset'
  | 'edge.invalid'
  | 'edge.duplicate_id'
  | 'edge.dangling_endpoint'
  | 'setting.invalid'
  | 'setting.duplicate_key'
  | 'asset.entry_invalid'
  | 'asset.duplicate_entry'
  | 'asset.hash_mismatch'
  | 'asset.size_mismatch'
  | 'asset.missing_body'

export interface PreflightProblem {
  readonly code: PreflightCode
  readonly detail: string
  /** 结构化子代码：validate* 的原始 issue code（journal.date、container.cycle、
   * container.duplicate_parent…），让导入结果能区分同一外层码下的不同损坏。 */
  readonly inner?: string
  /** 门禁失败时携带原始拒绝错误（schemaVersion too_new / unknown algo → 导入结果提取 userMessage）。 */
  readonly gate?: ArchiveRejectedError
}

export interface PreflightStats {
  readonly journals: number
  readonly cards: number
  readonly edges: number
  readonly settings: number
  readonly assets: number
}

export interface PreflightPlan {
  readonly stats: PreflightStats
  readonly batches: readonly (readonly StagedEntry[])[]
}

export type PreflightResult = { readonly ok: true; readonly plan: PreflightPlan } | { readonly ok: false; readonly problems: readonly PreflightProblem[] }

export interface AssetBody {
  readonly actualHash: string
  readonly blob: Blob
  readonly size: number
}

export interface PreflightInput {
  readonly manifestJson: string
  readonly journalsJson: string
  readonly edgesJson: string
  readonly settingsJson: string
  /** zip 内 assets/<hash> 条目：文件名声明的 hash → 实际 sha256/Blob/字节数。 */
  readonly assets: ReadonlyMap<string, AssetBody>
  readonly batchLimit: number
  /** 注入迁移表（测试覆盖链式迁移用；生产传默认空表）。 */
  readonly migrationTable?: readonly SchemaMigration[]
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function parseJsonField(label: string, text: string): { ok: true; data: unknown } | { ok: false; problem: PreflightProblem } {
  try {
    return { ok: true, data: JSON.parse(text) }
  } catch {
    return { ok: false, problem: { code: 'json.unparsable', detail: label } }
  }
}

function stagingKey(prefix: 'j' | 'a' | 'e' | 's', id: string): StagingKey {
  return `${prefix}:${id}`
}

const short = (s: string): string => s.slice(0, 12)

/** 预检主入口。所有失败都走 problems，函数本身无副作用、不抛异常（内部错误也转 problem）。 */
export function preflightArchive(input: PreflightInput): PreflightResult {
  const problems: PreflightProblem[] = []
  const say = (code: PreflightCode, detail: string, extra?: { readonly inner?: string; readonly gate?: ArchiveRejectedError }): void => {
    problems.push(extra === undefined ? { code, detail } : { code, detail, ...extra })
  }
  const bail = (): PreflightResult => ({ ok: false, problems })

  const manifestField = parseJsonField('manifest.json', input.manifestJson)
  if (!manifestField.ok) return { ok: false, problems: [manifestField.problem] }
  const journalsField = parseJsonField('journals.json', input.journalsJson)
  if (!journalsField.ok) return { ok: false, problems: [journalsField.problem] }
  const edgesField = parseJsonField('edges.json', input.edgesJson)
  if (!edgesField.ok) return { ok: false, problems: [edgesField.problem] }
  const settingsField = parseJsonField('settings.json', input.settingsJson)
  if (!settingsField.ok) return { ok: false, problems: [settingsField.problem] }

  const rawManifest = manifestField.data
  if (!isObj(rawManifest)) return { ok: false, problems: [{ code: 'json.unparsable', detail: 'manifest.json 顶层应是非数组对象' }] }
  try {
    checkArchiveGates(rawManifest['schemaVersion'], rawManifest['hashAlgo'])
  } catch (err) {
    if (err instanceof ArchiveRejectedError) {
      return { ok: false, problems: [{ code: 'archive_gate', detail: err.message.slice(0, 240), gate: err }] }
    }
    return { ok: false, problems: [{ code: 'archive_gate', detail: `archive_gate: ${String(err)}` }] }
  }
  if (rawManifest['app'] !== 'banji') {
    return { ok: false, problems: [{ code: 'archive_gate', detail: `app 不是 banji: ${String(rawManifest['app'])}` }] }
  }
  const exportedAt = rawManifest['exportedAt']
  if (typeof exportedAt !== 'string') return { ok: false, problems: [{ code: 'json.unparsable', detail: 'exportedAt 非字符串' }] }
  const rawAssets = rawManifest['assets']
  if (!Array.isArray(rawAssets)) return { ok: false, problems: [{ code: 'json.unparsable', detail: 'manifest.assets 非数组' }] }
  if (!Array.isArray(journalsField.data) || !Array.isArray(edgesField.data) || !Array.isArray(settingsField.data)) {
    return { ok: false, problems: [{ code: 'json.unparsable', detail: 'journals/edges/settings 顶层必须是数组' }] }
  }

  const migrated = migrateArchiveSafely(rawManifest['schemaVersion'], { journalDocs: journalsField.data, edges: edgesField.data, settings: settingsField.data, assetIndex: rawAssets }, input.migrationTable, say)
  if (migrated === null) return bail()

  const assetIndex = new Map<string, ArchiveAssetIndexEntry>()
  for (const entry of migrated.assetIndex) {
    const okEntry = narrowAssetEntry(entry)
    if (okEntry === null) {
      say('asset.entry_invalid', `资产索引条目形状非法: ${JSON.stringify(entry).slice(0, 80)}`)
      continue
    }
    if (assetIndex.has(okEntry.hash)) say('asset.duplicate_entry', `manifest 资产 hash 重复: ${short(okEntry.hash)}`)
    else assetIndex.set(okEntry.hash, okEntry)
  }

  const staged: StagedEntry[] = []
  const seenDates = new Set<string>()
  const seenCardIds = new Set<string>()
  let cardTotal = 0
  let journalCount = 0
  for (const rawDoc of migrated.journalDocs) {
    const v = validateJournalDoc(rawDoc)
    if (!v.ok) {
      for (const is of v.issues) say('journal.invalid', `${is.code} @ ${is.path}`, { inner: is.code })
      continue
    }
    if (!isObj(rawDoc)) continue
    const date = rawDoc['date']
    if (typeof date !== 'string' || !isValidDateString(date) || seenDates.has(date)) {
      if (typeof date === 'string' && seenDates.has(date)) say('journal.duplicate_date', date)
      else say('journal.invalid', `date=${JSON.stringify(date)}`)
      continue
    }
    seenDates.add(date)
    const cards = rawDoc['cards']
    if (Array.isArray(cards)) {
      cardTotal += cards.length
      for (const rawCard of cards) {
        const rc = readCard(rawCard)
        if (!rc.ok) continue
        if (seenCardIds.has(rc.card.id)) say('card.duplicate_id', `卡片 id 重复: ${short(rc.card.id)}`)
        seenCardIds.add(rc.card.id)
        for (const h of collectCardHashRefs(rc.card.props)) {
          if (!assetIndex.has(h)) say('card.dangling_asset', `卡片 ${short(rc.card.id)} 引用了不在 manifest 的资产 ${short(h)}`)
        }
      }
    }
    staged.push({ key: stagingKey('j', date), value: rawDoc })
    journalCount += 1
  }

  let assetCount = 0
  for (const [hash, declared] of assetIndex) {
    const body = input.assets.get(hash)
    if (body === undefined) {
      say('asset.missing_body', `资产 ${short(hash)} 在 ZIP 中缺少正文`)
      continue
    }
    if (body.actualHash !== hash) {
      say('asset.hash_mismatch', `资产 ${short(hash)} 实际 sha256=${short(body.actualHash)}`)
      continue
    }
    if (body.size !== declared.size) {
      say('asset.size_mismatch', `资产 ${short(hash)} 声明 ${String(declared.size)} 字节，实际 ${String(body.size)}`)
      continue
    }
    staged.push({
      key: stagingKey('a', hash),
      value:
        declared.name === undefined
          ? { hash, mime: declared.mime, size: declared.size, addedAt: exportedAt, blob: body.blob }
          : { hash, mime: declared.mime, name: declared.name, size: declared.size, addedAt: exportedAt, blob: body.blob },
    })
    assetCount += 1
  }

  const seenEdgeIds = new Set<string>()
  let edgeCount = 0
  for (const rawEdge of migrated.edges) {
    const v = validateEdge(rawEdge)
    if (!v.ok) {
      for (const is of v.issues) say('edge.invalid', `${is.code} @ ${is.path}`, { inner: is.code })
      continue
    }
    if (!isObj(rawEdge)) continue
    const id = rawEdge['id']
    if (typeof id !== 'string') continue
    if (seenEdgeIds.has(id)) {
      say('edge.duplicate_id', id)
      continue
    }
    seenEdgeIds.add(id)
    // D4 对称闸：端点必须指向本档案的卡。自家导出已剪边产生不了悬空；这道闸拦的是
    // 第三方/手改档案把无主的线偷渡进库——库中永不存谎言档案，边也不能说谎。
    const src = String(rawEdge['source'])
    const tgt = String(rawEdge['target'])
    if (!seenCardIds.has(src) || !seenCardIds.has(tgt)) {
      say('edge.dangling_endpoint', `边 ${short(id)} 端点无卡: ${short(src)}↔${short(tgt)}`)
      continue
    }
    staged.push({ key: stagingKey('e', id), value: rawEdge })
    edgeCount += 1
  }

  const seenSettingKeys = new Set<string>()
  let settingCount = 0
  for (const rawSetting of migrated.settings) {
    const v = validateArchiveSetting(rawSetting)
    if (!v.ok) {
      for (const is of v.issues) say('setting.invalid', `${is.code} @ ${is.path}`, { inner: is.code })
      continue
    }
    if (!isObj(rawSetting)) continue
    const key = rawSetting['key']
    if (typeof key !== 'string') continue
    if (seenSettingKeys.has(key)) {
      say('setting.duplicate_key', key)
      continue
    }
    seenSettingKeys.add(key)
    staged.push({ key: stagingKey('s', key), value: { key, value: rawSetting['value'], updatedAt: exportedAt } })
    settingCount += 1
  }

  if (problems.length > 0) return bail()

  const batches: StagedEntry[][] = []
  for (let i = 0; i < staged.length; i += input.batchLimit) batches.push(staged.slice(i, i + input.batchLimit))
  return { ok: true, plan: { stats: { journals: journalCount, cards: cardTotal, edges: edgeCount, assets: assetCount, settings: settingCount }, batches } }
}

type Say = (code: PreflightCode, detail: string, extra?: { readonly inner?: string; readonly gate?: ArchiveRejectedError }) => void

function migrateArchiveSafely(version: unknown, sets: ArchiveRecordSets, table: readonly SchemaMigration[] | undefined, say: Say): ReturnType<typeof migrateArchive> | null {
  try {
    return migrateArchive({ schemaVersion: typeof version === 'number' ? version : 0, ...sets }, table ?? [])
  } catch (err) {
    if (err instanceof ArchiveRejectedError) {
      say('archive_gate', `迁移失败: ${err.code}`, { gate: err })
    } else {
      say('archive_gate', `迁移失败: ${String(err).slice(0, 200)}`)
    }
    return null
  }
}
