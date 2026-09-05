// 中介对外契约：动作表与选项。状态形状住 dayState.ts，编排在 store.ts。
import type { CardId, CardPos, CardSize } from '../domain/types'
import type { ImageProber } from './probe'
import type { VideoProber } from './videoProbe'
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
  /** 添卡种类纸单（R9·D3）：手记/代码/链接各落一型新纸并进编辑态（正文=添一张卡、垫纸=造叠，各走原动作）。 */
  addCardOf(kind: 'markdown' | 'code' | 'link'): void
  /** 一句耳语（便签通道）：链接没写完整时的「写个完整网址…」从这里出。 */
  whisper(msg: string): void
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
  /** 宇宙被整体替换（导入成功）：待撤快照、在途/在败的编辑意图、拖拽瞬态同批作废——旧世界的一切绝不复活进新宇宙。 */
  onUniverseReplaced(): void
  /** 牵线（D1）：⋯菜单入口；起点卡再点一下即收线——自我可逆，不占托盘（R5 D7 口径）。 */
  startLinking(id: CardId): void
  /** 收线：Escape / 点空纸面 / 再点起点，三扇之门都走这里。 */
  cancelLinking(): void
  /** 点中靶纸：牵线过缝（同对/自环/端点无卡由缝静默拒）；成了才上账，两纸同落定 180ms。 */
  linkTo(target: CardId): void
  /** 撕线（D3）：无 undo 托盘——重新牵一根就是同一只手反过来，自我可逆。 */
  removeLine(id: string): void
  /** 目光切换（D5/R8·D3）：卡片/线/图瞬态；切去线时锚点定在当下选中卡，切图不带锚，不留视图偏好。 */
  setGaze(gaze: 'cards' | 'thread' | 'graph', anchor: CardId | null): void
  /** 撕线签住哪根线（D3）：点线请出、Esc/点空退场；瞬态。 */
  setLineChip(id: string | null): void
  dismissNote(): void
}

export interface DayStoreOptions {
  readonly probe?: ImageProber
  readonly probeVideo?: VideoProber
}

export interface DayStore {
  readonly state: DayState
  readonly actions: DayActions
}
