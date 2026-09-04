// 手写薄壳 IndexedDB 封装（约 120 行）。只有这一层 + schema/repo 触碰 IDB。
// 提供两种风格：promise（普通 CRUD）与回调（commit 阶段：绝不在事务存活期 await 非 IDB 异步）。

export function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error(String(req.error)))
  })
}

/** 以 oncomplete 为提交屏障（契约要点：不是 request.onsuccess）。 */
export function transactionDone(txn: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    txn.oncomplete = () => resolve()
    txn.onabort = () => reject(txn.error ?? new Error('transaction aborted'))
    txn.onerror = (ev) => {
      ev.preventDefault() // 阻断错误冒泡，统一交给 onabort 报告
      reject(txn.error ?? new Error('transaction error'))
    }
  })
}

export function openDatabase(
  name: string,
  version: number,
  onUpgradeNeed: (db: IDBDatabase, oldVersion: number, txn: IDBTransaction) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version)
    req.onupgradeneeded = (ev) => {
      const db = req.result
      const txn = req.transaction
      if (txn === null) {
        reject(new Error('onupgradeneeded 缺少版本事务'))
        return
      }
      try {
        onUpgradeNeed(db, ev.oldVersion, txn)
      } catch (err) {
        txn.abort()
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error(String(req.error)))
    req.onblocked = () => reject(new Error(`IndexedDB 升级被其他连接阻塞: ${name}`))
  })
}

/** 单 store 辅助：fn 同步发出的所有请求跑在同一事务里，oncomplete 时 resolve。 */
export async function withStore<T>(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const txn = db.transaction([storeName], mode)
  const pending = fn(txn.objectStore(storeName))
  const done = transactionDone(txn)
  const value = await pending
  await done
  return value
}

export function getAll<T>(store: IDBObjectStore): Promise<T[]> {
  return request(store.getAll() as IDBRequest<T[]>)
}

export function getOne<T>(store: IDBObjectStore, key: IDBValidKey): Promise<T | undefined> {
  return request(store.get(key) as IDBRequest<T | undefined>)
}

export function putRecord(store: IDBObjectStore, value: unknown, key?: IDBValidKey): Promise<IDBValidKey> {
  return key === undefined ? request(store.put(value)) : request(store.put(value, key))
}

export function deleteRecord(store: IDBObjectStore, key: IDBValidKey): Promise<undefined> {
  return request(store.delete(key))
}

export function clearStore(store: IDBObjectStore): Promise<undefined> {
  return request(store.clear())
}

export function indexAll<T>(store: IDBObjectStore, indexName: string, query: IDBValidKey | IDBKeyRange): Promise<T[]> {
  return request(store.index(indexName).getAll(query) as IDBRequest<T[]>)
}

export interface CursorStep {
  /** 在回调内对这个 store 继续发请求是安全的——事件即事务任务，不会丢事务。 */
  (cursor: IDBCursorWithValue): void
}

/**
 * 游标扫描（回调式）。约定：step 正常返回则继续迭代；step 抛错 = 致命，abort 事务
 * （错误经 transactionDone 的 onabort 上报）。step 内部只准发 IDB 同步请求。
 */
export function scanCursor(txn: IDBTransaction, store: IDBObjectStore, step: CursorStep, onFinished?: () => void): void {
  const req = store.openCursor()
  req.onsuccess = () => {
    const cursor = req.result
    if (cursor === null) {
      onFinished?.()
      return
    }
    try {
      step(cursor)
      cursor.continue()
    } catch {
      txn.abort()
    }
  }
  req.onerror = () => {
    txn.abort()
  }
}

export function deleteDatabase(name: string): Promise<undefined> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name)
    req.onsuccess = () => resolve(undefined)
    req.onerror = () => reject(req.error ?? new Error(String(req.error)))
    req.onblocked = () => reject(new Error(`deleteDatabase 被阻塞: ${name}`))
  })
}
