import type { EdgeRecord, JournalDoc } from '../domain/types'

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
