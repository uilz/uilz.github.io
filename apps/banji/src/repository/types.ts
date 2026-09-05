import type { AssetRecord, CardId, EdgeRecord, JournalDoc, SettingsRecord, StagingKey } from '../domain/types'

// 仓库接口：archive 层与测试只依赖这些接口，实现注入 fake-indexeddb。

/** 单批暂存记录上限（导入第 2 阶段的生产端约束，写在类型旁让两层共享）。 */
export const MAX_STAGE_BATCH = 200

/**
 * R10·债#5 提交门：导入第 3 阶段的调度权。持串行中介的宿主把 commit 事务「排进自己那条链」
 * （worldGen 排入即 ++、在途意图先落定、作废整斧在链环内执行）；未注册 = 直通立即执行（无头调用者）。
 * 门只调度、不重排事务——commit 仍是恰好一个 readwrite 事务、oncomplete-only（契约 §7 铁律不动）。
 */
export type CommitGate = <T>(task: () => Promise<T>) => Promise<T>

export interface JournalRepo {
  get(date: string): Promise<JournalDoc | undefined>
  put(doc: JournalDoc): Promise<void>
  remove(date: string): Promise<void>
  list(): Promise<JournalDoc[]>
  clear(): Promise<void>
}

export interface AssetRepo {
  get(hash: string): Promise<AssetRecord | undefined>
  put(asset: AssetRecord): Promise<void>
  remove(hash: string): Promise<void>
  list(): Promise<AssetRecord[]>
  clear(): Promise<void>
}

export interface EdgeRepo {
  get(id: string): Promise<EdgeRecord | undefined>
  put(edge: EdgeRecord): Promise<void>
  remove(id: string): Promise<void>
  bySource(source: CardId): Promise<EdgeRecord[]>
  byTarget(target: CardId): Promise<EdgeRecord[]>
  list(): Promise<EdgeRecord[]>
  clear(): Promise<void>
}

export interface SettingsRepo {
  get(key: string): Promise<SettingsRecord | undefined>
  put(setting: SettingsRecord): Promise<void>
  remove(key: string): Promise<void>
  list(): Promise<SettingsRecord[]>
  clear(): Promise<void>
}

/** staging 值是“已验证透传”：写入方必须是 archive 预检通过的原始 JSON/记录（unknown 保持其无类型特权）。 */
export type StagedValue = unknown

export interface StagedEntry {
  readonly key: StagingKey
  readonly value: StagedValue
}

/** 聚合仓库：三阶段导入用到的批量入口也在这里（只有它能合法触达 staging/commit）。 */
export interface Repo {
  journals: JournalRepo
  assets: AssetRepo
  edges: EdgeRepo
  settings: SettingsRepo
  clearStaging(): Promise<void>
  stageBatch(batch: readonly StagedEntry[]): Promise<void>
  /** 唯一提交点：单事务清空四个活动 store 并把 staging 游标排干（排期归 CommitGate，事务本体在此）。 */
  commitStaging(): Promise<void>
  close(): void
}
