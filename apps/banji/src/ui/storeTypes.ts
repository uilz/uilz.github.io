// 中介对外契约：动作表与选项。状态形状住 dayState.ts，编排在 store.ts。
import type { CardId, CardPos, CardSize } from '../domain/types'
import type { ImageProber } from './probe'
import type { DayState } from './dayState'

export interface DayActions {
  select(id: CardId | null): void
  enterEdit(id: CardId): void
  exitEdit(): void
  /** 渲染器只交“变了哪些键”；与存储的 raw props 合并写回 —— 未知扩展字段不丢。 */
  patchProps(id: CardId, patch: Record<string, unknown>): void
  move(id: CardId, pos: CardPos): void
  resize(id: CardId, size: CardSize): void
  remove(id: CardId): void
  addTextCard(): void
  /** 夹带：图片/文件走 addAsset→addCard；at=null 时用瀑布落点（按钮/粘贴入口）。 */
  attach(files: readonly File[], at?: CardPos | null): void
  /** 保存失败回执上的“再试”：把未落盘意图重新推上串行链。 */
  retrySave(): void
  /** “再想想”：把待撤快照沿同一条串行链送回 restoreCards（绝不与在途编辑抢跑）。 */
  undoDelete(): void
  /** 宇宙被整体替换（导入成功）：待撤快照作废——恢复进新宇宙只会污染它。 */
  invalidateUndo(): void
  dismissNote(): void
}

export interface DayStoreOptions {
  readonly probe?: ImageProber
}

export interface DayStore {
  readonly state: DayState
  readonly actions: DayActions
}
