// 中介对外契约：动作表与选项。状态形状住 dayState.ts，编排在 store.ts。
import type { CardId, CardPos, CardSize } from '../domain/types'
import type { ImageProber } from './probe'
import type { DragFollow, DayState } from './dayState'

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
  /** 造叠（D1）：底栏第三枚把手，落一张空的垫纸并即刻选中，耳语等着纸进来。 */
  createContainer(): void
  /** 拖入卡内（D3）：childId 落至 childPos 并被 parentId 收编；旧叠自动让渡，垫纸扩边（D5）。 */
  attachChild(parentId: CardId, childId: CardId, childPos: CardPos): void
  /** 拖出卡外（D4）：释放点越出认领垫纸的边界，纸（连同它自己的子纸）独立落定。 */
  detachChild(childId: CardId, pos: CardPos): void
  /** 拖拽中的临时高亮（D3）：只住 dayState，抬手即熄，永不过缝。 */
  setDropTarget(id: CardId | null): void
  /** 拖垫纸时子纸的实时跟移：纯视觉瞬态，抬手即熄。 */
  setDragFollow(follow: DragFollow | null): void
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
