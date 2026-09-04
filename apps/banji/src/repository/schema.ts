import { openDatabase, scanCursor } from './idb'
import type { MigrationTopology, SchemaMigration } from '../archive/migration'
import { MIGRATIONS } from '../archive/migration'

export const DB_NAME = 'banji-journal'

/** IDB 整型版本与归档 schemaVersion 是两个互相独立的整数（契约 §7），这里只管前者。 */
export const DB_VERSION = 1

/** v1 五个 object store 的名字。staging 在 v1 就建好，是跨 store 大事务的前提。 */
export const STORES = {
  settings: 'settings',
  journals: 'journals',
  assets: 'assets',
  edges: 'edges',
  staging: 'staging',
} as const

export type StoreName = (typeof STORES)[keyof typeof STORES]

/** v1 建库：五个 store 全部声明（含刻意留空的 staging 与预留的 edges）。 */
export function createV1Schema(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(STORES.settings)) {
    db.createObjectStore(STORES.settings, { keyPath: 'key' })
  }
  if (!db.objectStoreNames.contains(STORES.journals)) {
    db.createObjectStore(STORES.journals, { keyPath: 'date' })
  }
  if (!db.objectStoreNames.contains(STORES.assets)) {
    db.createObjectStore(STORES.assets, { keyPath: 'hash' })
  }
  if (!db.objectStoreNames.contains(STORES.edges)) {
    const edges = db.createObjectStore(STORES.edges, { keyPath: 'id' })
    edges.createIndex('by_source', 'source')
    edges.createIndex('by_target', 'target')
  }
  if (!db.objectStoreNames.contains(STORES.staging)) {
    db.createObjectStore(STORES.staging) // out-of-line 键
  }
}

function applyStoreTransform(txn: IDBTransaction, store: StoreName, fn: (raw: unknown) => unknown): void {
  if (!txn.objectStoreNames.contains(store)) return
  scanCursor(txn, txn.objectStore(store), (cursor) => {
    cursor.update(fn(cursor.value))
  })
}

/** 拓扑变更只允许“新增/可重建”，绝不删数据；声明式规格在此解释执行。 */
function applyTopology(db: IDBDatabase, topo: MigrationTopology): void {
  for (const spec of topo.createStores ?? []) {
    if (db.objectStoreNames.contains(spec.name)) continue
    const store =
      spec.keyPath === undefined
        ? db.createObjectStore(spec.name)
        : db.createObjectStore(spec.name, { keyPath: spec.keyPath })
    for (const idx of spec.indexes ?? []) store.createIndex(idx.name, idx.keyPath)
  }
}

export function openBanjiDatabase(
  table: readonly SchemaMigration[] = MIGRATIONS,
  name: string = DB_NAME,
  version: number = DB_VERSION,
): Promise<IDBDatabase> {
  return openDatabase(name, version, (db, oldVersion, txn) => {
    if (oldVersion < 1) createV1Schema(db)
    upgradeIdbData(db, txn, oldVersion, table)
  })
}

/** onupgradeneeded 的数据侧：与 migrateArchive 共用同一张迁移表，逐跳、缺口即拒绝。 */
export function upgradeIdbData(
  db: IDBDatabase,
  txn: IDBTransaction,
  oldVersion: number,
  table: readonly SchemaMigration[],
): void {
  let v = Math.max(oldVersion, 1) // 0→1 建库已由 createV1Schema 完成
  while (v < db.version) {
    const next = table.find((m) => m.from === v)
    if (next === undefined) {
      throw new Error(`缺少 ${String(v)} → ${String(v + 1)} 的库迁移，拒绝半途升级`)
    }
    if (next.topology) applyTopology(db, next.topology)
    if (next.records?.settings) applyStoreTransform(txn, STORES.settings, next.records.settings)
    if (next.records?.journals) applyStoreTransform(txn, STORES.journals, next.records.journals)
    if (next.records?.assetRecords) applyStoreTransform(txn, STORES.assets, next.records.assetRecords)
    if (next.records?.edges) applyStoreTransform(txn, STORES.edges, next.records.edges)
    v = next.to
  }
}
