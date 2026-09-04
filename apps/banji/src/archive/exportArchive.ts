import type { AssetRecord, JournalDoc } from '../domain/types'
import { collectReachableHashes } from '../domain/gc'
import type { Repo } from '../repository/types'
import { ARCHIVE_SCHEMA_CURRENT } from './migration'
import {
  APP_NAME,
  ASSET_DIR,
  canonicalJson,
  FILE_EDGES,
  FILE_JOURNALS,
  FILE_MANIFEST,
  FILE_SETTINGS,
  HASH_ALGO,
  type ArchiveAssetIndexEntry,
  type ArchiveManifest,
  type ArchiveSettingsEntry,
} from './format'
import { blobBytes } from './hash'
import { buildZip, type ZipFileSpec } from './zip'

// Export = 规范化 + GC：只收录被引用的资产；未引用的“孤儿资产”不入档
// （GC 只发生在导出这一站，存储/删除路径永不动资产——用户数据不会被“顺手清掉”）。

export const APP_VERSION = '0.1.0'

export interface ExportOptions {
  readonly appVersion?: string
  /** 注入时钟：导出确定性测试用。 */
  readonly now?: () => Date
}

export type ExportResult =
  | { readonly ok: true; readonly zip: Uint8Array<ArrayBuffer> }
  | { readonly ok: false; readonly reason: 'missing_asset'; readonly userMessage: string; readonly missingHashes: readonly string[] }

const utf8 = new TextEncoder()

function assetIndexEntry(a: AssetRecord): ArchiveAssetIndexEntry {
  return a.name === undefined
    ? { hash: a.hash, mime: a.mime, size: a.size }
    : { hash: a.hash, mime: a.mime, name: a.name, size: a.size }
}

export async function exportArchive(repo: Repo, opts: ExportOptions = {}): Promise<ExportResult> {
  const journals: JournalDoc[] = (await repo.journals.list()).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const edges = (await repo.edges.list()).sort((a, b) => (a.id < b.id ? -1 : 1))
  const settings = await repo.settings.list()
  const assets = await repo.assets.list()

  const referenced = collectReachableHashes(journals.flatMap((j) => j.cards))
  const storedByHash = new Map(assets.map((a) => [a.hash, a]))
  const included: AssetRecord[] = []
  const missing: string[] = []
  for (const hash of [...referenced].sort()) {
    const record = storedByHash.get(hash)
    if (record === undefined) missing.push(hash)
    else included.push(record)
  }
  if (missing.length > 0) {
    return {
      ok: false,
      reason: 'missing_asset',
      missingHashes: missing,
      userMessage: '日记中引用的附件在本地库中缺失，为免生成不完整的档案，本次导出已中止。你的日记没有丢失；可先核对缺失清单后再试。',
    }
  }
  included.sort((a, b) => (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0))
  const idxEntries: ArchiveAssetIndexEntry[] = included.map(assetIndexEntry)

  const manifest: ArchiveManifest = {
    app: APP_NAME,
    schemaVersion: ARCHIVE_SCHEMA_CURRENT,
    hashAlgo: HASH_ALGO,
    appVersion: opts.appVersion ?? APP_VERSION,
    exportedAt: (opts.now === undefined ? new Date() : opts.now()).toISOString(),
    counts: {
      journals: journals.length,
      cards: journals.reduce((acc, j) => acc + j.cards.length, 0),
      edges: edges.length,
      assets: idxEntries.length,
    },
    assets: idxEntries,
  }

  const settingsEntries: ArchiveSettingsEntry[] = settings
    .map((s) => ({ key: s.key, value: s.value }))
    .sort((a, b) => (a.key < b.key ? -1 : 1))

  const files: ZipFileSpec[] = [
    { name: FILE_MANIFEST, data: utf8.encode(canonicalJson(manifest)) },
    { name: FILE_JOURNALS, data: utf8.encode(canonicalJson(journals)) },
    { name: FILE_EDGES, data: utf8.encode(canonicalJson(edges)) },
    { name: FILE_SETTINGS, data: utf8.encode(canonicalJson(settingsEntries)) },
  ]
  for (const record of included) {
    files.push({ name: `${ASSET_DIR}${record.hash}`, data: await blobBytes(record.blob), store: true })
  }
  return { ok: true, zip: buildZip(files) }
}
