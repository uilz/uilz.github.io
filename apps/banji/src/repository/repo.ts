import type { AssetRecord, CardId, EdgeRecord, JournalDoc, SettingsRecord } from '../domain/types'
import { validateIdbVersion, type SchemaMigration } from '../archive/migration'
import { clearStore, deleteDatabase, getAll, getOne, indexAll, putRecord, request, scanCursor, transactionDone, withStore } from './idb'
import { DB_NAME, DB_VERSION, openBanjiDatabase, STORES } from './schema'
import { MAX_STAGE_BATCH, type AssetRepo, type EdgeRepo, type JournalRepo, type Repo, type SettingsRepo, type StagedEntry } from './types'

export { deleteDatabase }

function singleStore<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => Promise<T>): Promise<T> {
  return withStore(db, store, mode, fn)
}

function makeJournals(db: IDBDatabase): JournalRepo {
  return {
    get: (date) => singleStore(db, STORES.journals, 'readonly', (s) => getOne<JournalDoc>(s, date)),
    put: (d) => singleStore(db, STORES.journals, 'readwrite', async (s) => { void (await putRecord(s, d)) }),
    remove: (date) => singleStore(db, STORES.journals, 'readwrite', async (s) => { void (await removeKey(s, date)) }),
    list: () => singleStore(db, STORES.journals, 'readonly', (s) => getAll<JournalDoc>(s)),
    clear: () => singleStore(db, STORES.journals, 'readwrite', async (s) => { void (await clearStore(s)) }),
  }
}

function makeAssets(db: IDBDatabase): AssetRepo {
  return {
    get: (hash) => singleStore(db, STORES.assets, 'readonly', (s) => getOne<AssetRecord>(s, hash)),
    put: (a) => singleStore(db, STORES.assets, 'readwrite', async (s) => { void (await putRecord(s, a)) }),
    remove: (hash) => singleStore(db, STORES.assets, 'readwrite', async (s) => { void (await removeKey(s, hash)) }),
    list: () => singleStore(db, STORES.assets, 'readonly', (s) => getAll<AssetRecord>(s)),
    clear: () => singleStore(db, STORES.assets, 'readwrite', async (s) => { void (await clearStore(s)) }),
  }
}

function makeEdges(db: IDBDatabase): EdgeRepo {
  return {
    get: (id) => singleStore(db, STORES.edges, 'readonly', (s) => getOne<EdgeRecord>(s, id)),
    put: (e) => singleStore(db, STORES.edges, 'readwrite', async (s) => { void (await putRecord(s, e)) }),
    remove: (id) => singleStore(db, STORES.edges, 'readwrite', async (s) => { void (await removeKey(s, id)) }),
    bySource: (source: CardId) => singleStore(db, STORES.edges, 'readonly', (s) => indexAll<EdgeRecord>(s, 'by_source', source)),
    byTarget: (target: CardId) => singleStore(db, STORES.edges, 'readonly', (s) => indexAll<EdgeRecord>(s, 'by_target', target)),
    list: () => singleStore(db, STORES.edges, 'readonly', (s) => getAll<EdgeRecord>(s)),
    clear: () => singleStore(db, STORES.edges, 'readwrite', async (s) => { void (await clearStore(s)) }),
  }
}

function makeSettings(db: IDBDatabase): SettingsRepo {
  return {
    get: (key) => singleStore(db, STORES.settings, 'readonly', (s) => getOne<SettingsRecord>(s, key)),
    put: (v) => singleStore(db, STORES.settings, 'readwrite', async (s) => { void (await putRecord(s, v)) }),
    remove: (key) => singleStore(db, STORES.settings, 'readwrite', async (s) => { void (await removeKey(s, key)) }),
    list: () => singleStore(db, STORES.settings, 'readonly', (s) => getAll<SettingsRecord>(s)),
    clear: () => singleStore(db, STORES.settings, 'readwrite', async (s) => { void (await clearStore(s)) }),
  }
}

function removeKey(s: IDBObjectStore, key: IDBValidKey): Promise<undefined> {
  return request(s.delete(key))
}

function routeStaged(value: unknown, key: string): { store: string; inlineMatches: boolean } {
  const rec = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  if (key.startsWith('j:')) return { store: STORES.journals, inlineMatches: rec['date'] === key.slice(2) }
  if (key.startsWith('a:')) return { store: STORES.assets, inlineMatches: rec['hash'] === key.slice(2) }
  if (key.startsWith('e:')) return { store: STORES.edges, inlineMatches: rec['id'] === key.slice(2) }
  if (key.startsWith('s:')) return { store: STORES.settings, inlineMatches: rec['key'] === key.slice(2) }
  return { store: '', inlineMatches: false }
}

export interface OpenRepoOptions {
  readonly name?: string
  readonly version?: number
  readonly migrationTable?: readonly SchemaMigration[]
}

export async function openRepo(opts: OpenRepoOptions = {}): Promise<Repo> {
  const name = opts.name ?? DB_NAME
  const version = opts.version ?? DB_VERSION
  validateIdbVersion(version)
  const db = await openBanjiDatabase(opts.migrationTable, name, version)
  return {
    journals: makeJournals(db),
    assets: makeAssets(db),
    edges: makeEdges(db),
    settings: makeSettings(db),
    clearStaging: () => singleStore(db, STORES.staging, 'readwrite', async (s) => { void (await clearStore(s)) }),
    stageBatch: async (batch: readonly StagedEntry[]) => {
      if (batch.length === 0 || batch.length > MAX_STAGE_BATCH) {
        throw new Error(`stageBatch 批次大小必须在 1..${String(MAX_STAGE_BATCH)}，收到 ${String(batch.length)}`)
      }
      await singleStore(db, STORES.staging, 'readwrite', async (s) => {
        for (const entry of batch) {
          void (await putRecord(s, entry.value, entry.key))
        }
      })
    },
    commitStaging: () => commitStaging(db),
    close: () => db.close(),
  }
}

/**
 * 唯一提交点——事务纪律（契约 §7 关键陷阱）：
 * 1) 同一 readwrite 事务横跨全部五个 store；四个活动 store 的 clear 与 staging 游标在同一个同步回合内全部发出；
 * 2) 游标回调里 put+delete+continue 串联，期间绝不混入任何非 IDB await——一旦微任务栈见底且无挂起请求，事务会静默自动提交；
 * 3) 完成以 oncomplete 为准（transactionDone），不是任何 request.onsuccess；
 * 4) 键前缀与内联键不一致视为中心腐坏，即刻 abort（宁可回滚也不半提交）。
 */
export function commitStaging(db: IDBDatabase): Promise<void> {
  const txn = db.transaction(
    [STORES.journals, STORES.assets, STORES.edges, STORES.settings, STORES.staging],
    'readwrite',
  )
  const journals = txn.objectStore(STORES.journals)
  const assets = txn.objectStore(STORES.assets)
  const edges = txn.objectStore(STORES.edges)
  const settings = txn.objectStore(STORES.settings)
  const staging = txn.objectStore(STORES.staging)
  const done = transactionDone(txn)

  void journals.clear()
  void assets.clear()
  void edges.clear()
  void settings.clear()

  scanCursor(txn, staging, (cursor) => {
    const key = cursor.key
    if (typeof key !== 'string') {
      throw new Error(`staging 键非字符串: ${String(key)}`)
    }
    const { store, inlineMatches } = routeStaged(cursor.value, key)
    if (!inlineMatches || store === '') {
      throw new Error(`staging 键与内联键不一致: ${key}`)
    }
    const v = cursor.value
    if (store === STORES.journals) void journals.put(v)
    else if (store === STORES.assets) void assets.put(v)
    else if (store === STORES.edges) void edges.put(v)
    else void settings.put(v)
    cursor.delete()
  })

  return done
}
