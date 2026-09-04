import type { EdgeRecord, JournalDoc } from '../domain/types'
import { isHex64 } from '../domain/validate'

// 归档 ZIP 的布局常量与规范化 JSON。路径里永远不出现用户文件名（CJK/转义问题），
// 资产条目一律内容寻址：assets/<sha256hex>。

export const APP_NAME = 'banji'
export const HASH_ALGO = 'sha256'

export const FILE_MANIFEST = 'manifest.json'
export const FILE_JOURNALS = 'journals.json'
export const FILE_EDGES = 'edges.json'
export const FILE_SETTINGS = 'settings.json'
export const ASSET_DIR = 'assets/'

export interface ArchiveAssetIndexEntry {
  readonly hash: string
  readonly mime: string
  readonly name?: string
  readonly size: number
}

export interface ArchiveCounts {
  readonly journals: number
  readonly cards: number
  readonly edges: number
  readonly assets: number
}

export interface ArchiveManifest {
  readonly app: typeof APP_NAME
  readonly schemaVersion: number
  readonly hashAlgo: typeof HASH_ALGO
  readonly appVersion: string
  readonly exportedAt: string
  readonly counts: ArchiveCounts
  readonly assets: readonly ArchiveAssetIndexEntry[]
}

export interface ArchiveSettingsEntry {
  readonly key: string
  readonly value: unknown
}

/** manifest.assets 条目的逐项窄化（导入预检的第一道 JSON 闸；非法返回 null，不抛错）。 */
export function narrowAssetEntry(raw: unknown): ArchiveAssetIndexEntry | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const rec = raw as Record<string, unknown>
  if (!isHex64(rec['hash']) || typeof rec['mime'] !== 'string' || typeof rec['size'] !== 'number') return null
  const name = rec['name']
  if (name !== undefined && typeof name !== 'string') return null
  return name === undefined
    ? { hash: rec['hash'], mime: rec['mime'], size: rec['size'] }
    : { hash: rec['hash'], mime: rec['mime'], name, size: rec['size'] }
}

export interface ArchivePayload {
  readonly manifest: ArchiveManifest
  readonly journals: readonly JournalDoc[]
  readonly edges: readonly EdgeRecord[]
  readonly settings: readonly ArchiveSettingsEntry[]
  readonly assetBytes: ReadonlyMap<string, Uint8Array>
}

/** 确定性序列化：对象键排序，数组保序。导出结果字节级可复现，测试直接 diff。 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value))
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep)
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value).sort()) {
      out[key] = sortDeep((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}
