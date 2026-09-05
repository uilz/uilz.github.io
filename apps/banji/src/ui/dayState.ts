// 日中介的状态层 —— 纯 reducer：形状、迁移、ghost/note/回执计数、关系渲染账目。零 React hooks 之外的编排。
import type { Card, CardId, CardPos, CardSize, EdgeRecord } from '../domain/types'
import { edgesTouching } from '../domain/edges'
import type { CardPatch, DeleteSnapshot, ParentPatch } from '../application'

/** 夹带占位（ghost）：资产未落定前的安静虚影，只活在 UI 内存，刷新即无。 */
export interface Ghost {
  readonly token: number
  readonly kind: 'image' | 'file'
  readonly name: string
  readonly pos: CardPos
  readonly size: CardSize
}

/** 一闪即逝的回执（夹带没夹上）；保存失败回执是驻留态，走 saveFailed 计数。 */
export interface Note {
  readonly id: number
  readonly msg: string
}

/** 拖垫纸时子纸的实时跟移：纯视觉瞬态，抬手即熄（存储坐标要等落笔才动）。 */
export interface DragFollow {
  readonly rootId: CardId
  readonly dx: number
  readonly dy: number
}

/** 待撤销的"再想想"托盘：只有一格（单级 undo），住 UI 内存，刷新即无（契约决定，见 ROUNDS R4）。 */
export interface UndoTray {
  readonly seq: number
  readonly date: string
  readonly snapshot: DeleteSnapshot
  readonly count: number
  readonly expiresAt: number
}

export interface DayState {
  readonly date: string | null
  readonly loaded: boolean
  readonly cards: readonly Card[]
  readonly selectedId: CardId | null
  readonly editingId: CardId | null
  readonly lastAddedId: CardId | null
  readonly ghosts: readonly Ghost[]
  /** >0 = 有未落盘的编辑意图（多次失败合并为一张回执，值为意图条数）。 */
  readonly saveFailed: number
  readonly note: Note | null
  /** null = 无待撤销删除；非 null = 撕下的纸片还在桌边等着。 */
  readonly undo: UndoTray | null
  /** 拖拽进行中被指针压住的垫纸（D3）：瞬态视觉，永不过缝、永不落库。 */
  readonly dropTargetId: CardId | null
  /** 拖垫纸时子纸的实时跟移：瞬态视觉，抬手即熄。 */
  readonly dragFollow: DragFollow | null
  /** 触及本日卡片的边（开日随卡载入；撕/牵/恢复都过这里）。渲染时只画两端都在本日的线。 */
  readonly links: readonly EdgeRecord[]
  /** 牵线进行中的起点卡 id（D1）：瞬态，刷新即无，永不过缝。 */
  readonly linkFromId: CardId | null
  /** 牵成后短暂安分的两张纸（180ms 落定视觉）：瞬态。 */
  readonly settleIds: readonly CardId[]
  /** 目光（D5）：'cards' 过日子 / 'thread' 串珠子；瞬态、不落设置（任务书：不留视图偏好）。 */
  readonly gaze: 'cards' | 'thread'
  /** 切进线模式一瞬定下的锚点（当时的选中卡）；串珠底料。瞬态。 */
  readonly threadAnchor: CardId | null
  /** 撕线签住着的边 id（D3）：点线请出、Esc/点空退场。瞬态。 */
  readonly lineChipId: string | null
}

export const initialDayState: DayState = {
  date: null,
  loaded: false,
  cards: [],
  selectedId: null,
  editingId: null,
  lastAddedId: null,
  ghosts: [],
  saveFailed: 0,
  note: null,
  undo: null,
  dropTargetId: null,
  dragFollow: null,
  links: [],
  linkFromId: null,
  settleIds: [],
  gaze: 'cards',
  threadAnchor: null,
  lineChipId: null,
}

export type Action =
  | { readonly type: 'day/open'; readonly date: string }
  | { readonly type: 'day/loaded'; readonly cards: readonly Card[] }
  | { readonly type: 'card/added'; readonly card: Card; readonly edit: boolean }
  | { readonly type: 'card/patched'; readonly id: CardId; readonly patch: Partial<Card> }
  | { readonly type: 'cards/removed'; readonly ids: readonly CardId[] }
  | { readonly type: 'cards/set'; readonly cards: readonly Card[] }
  | { readonly type: 'cards/restored'; readonly cards: readonly Card[]; readonly parentPatches: readonly ParentPatch[] }
  | { readonly type: 'ui/select'; readonly id: CardId | null }
  | { readonly type: 'ui/edit'; readonly id: CardId | null }
  | { readonly type: 'ui/drop-target'; readonly id: CardId | null }
  | { readonly type: 'ui/drag-follow'; readonly follow: DragFollow | null }
  | { readonly type: 'links/set'; readonly links: readonly EdgeRecord[] }
  | { readonly type: 'links/merge'; readonly edges: readonly EdgeRecord[] }
  | { readonly type: 'link/remove'; readonly id: string }
  | { readonly type: 'ui/linking'; readonly id: CardId | null }
  | { readonly type: 'link/settle'; readonly ids: readonly CardId[] }
  | { readonly type: 'ui/gaze'; readonly gaze: 'cards' | 'thread'; readonly anchor: CardId | null }
  | { readonly type: 'line/chip'; readonly id: string | null }
  | { readonly type: 'ghost/add'; readonly ghost: Ghost }
  | { readonly type: 'ghost/remove'; readonly token: number }
  | { readonly type: 'save/failed'; readonly count: number }
  | { readonly type: 'save/clear' }
  | { readonly type: 'note/set'; readonly id: number; readonly msg: string }
  | { readonly type: 'note/clear' }
  | { readonly type: 'undo/push'; readonly tray: UndoTray }
  | { readonly type: 'undo/pop' }
  | { readonly type: 'undo/expire'; readonly seq: number }

export function dayReducer(state: DayState, action: Action): DayState {
  switch (action.type) {
    case 'day/open':
      // 未落盘意图（failedRef）跨日仍住在编排层，回执必须活着陪它；待撤的纸片同理——undo 认的是出生日。
      return { ...initialDayState, date: action.date, saveFailed: state.saveFailed, undo: state.undo }
    case 'day/loaded':
      return { ...state, loaded: true, cards: action.cards }
    case 'card/added':
      // 文字卡：新落的第一行就该能写。附件卡：选中即可，不进编辑态（无文字可写）。
      return {
        ...state,
        cards: [...state.cards, action.card],
        selectedId: action.card.id,
        editingId: action.edit ? action.card.id : null,
        lastAddedId: action.card.id,
      }
    case 'card/patched':
      return { ...state, cards: state.cards.map((c) => (c.id === action.id ? { ...c, ...action.patch } : c)) }
    case 'cards/removed': {
      const doomed = new Set<CardId>(action.ids)
      return {
        ...state,
        cards: state.cards.filter((c) => !doomed.has(c.id)),
        // D4：级联与剪边同批——乐观面上线也随纸离去（缝侧才是权威，这里只让视觉不骗人）。
        links: state.links.filter((e) => !doomed.has(e.source) && !doomed.has(e.target)),
        selectedId: state.selectedId !== null && doomed.has(state.selectedId) ? null : state.selectedId,
        editingId: state.editingId !== null && doomed.has(state.editingId) ? null : state.editingId,
      }
    }
    case 'cards/set':
      return { ...state, cards: action.cards }
    case 'cards/restored': {
      // 与 restoreCards（真缝侧）同一把尺：逐字补卡 + 幸存父卡按记录 index 重插——UI 内存与库内永不两样。
      const byId = new Map(state.cards.map((c) => [c.id, c]))
      let changed = false
      for (const card of action.cards) {
        if (byId.has(card.id)) continue
        byId.set(card.id, card)
        changed = true
      }
      for (const p of action.parentPatches) {
        const parent = byId.get(p.parentId)
        if (parent === undefined) continue
        const children = parent.children ?? []
        if (children.includes(p.childId)) continue
        const next = [...children]
        next.splice(Math.max(0, Math.min(next.length, p.index)), 0, p.childId)
        byId.set(p.parentId, { ...parent, children: next })
        changed = true
      }
      return changed ? { ...state, cards: [...byId.values()] } : state
    }
    case 'ui/select':
      return { ...state, selectedId: action.id }
    case 'ui/edit':
      return { ...state, editingId: action.id }
    case 'ui/drop-target':
      return state.dropTargetId === action.id ? state : { ...state, dropTargetId: action.id }
    case 'links/set':
      return state.links === action.links ? state : { ...state, links: action.links }
    case 'links/merge': {
      const known = new Set(state.links.map((e) => e.id))
      const extra = action.edges.filter((e) => !known.has(e.id))
      return extra.length === 0 ? state : { ...state, links: [...state.links, ...extra] }
    }
    case 'link/remove':
      return { ...state, links: state.links.filter((e) => e.id !== action.id) }
    case 'ui/linking':
      return state.linkFromId === action.id ? state : { ...state, linkFromId: action.id }
    case 'ui/gaze': {
      if (state.gaze === action.gaze && (action.gaze === 'cards' || state.threadAnchor === action.anchor)) return state
      return { ...state, gaze: action.gaze, threadAnchor: action.gaze === 'thread' ? action.anchor : null }
    }
    case 'line/chip':
      return state.lineChipId === action.id ? state : { ...state, lineChipId: action.id }
    case 'link/settle': {
      if (state.settleIds.length === 0 && action.ids.length === 0) return state
      const same = state.settleIds.length === action.ids.length && action.ids.every((id, i) => state.settleIds[i] === id)
      return same ? state : { ...state, settleIds: action.ids }
    }
    case 'ui/drag-follow': {
      const same = (state.dragFollow === null && action.follow === null) ||
        (state.dragFollow !== null && action.follow !== null &&
          state.dragFollow.rootId === action.follow.rootId &&
          state.dragFollow.dx === action.follow.dx &&
          state.dragFollow.dy === action.follow.dy)
      return same ? state : { ...state, dragFollow: action.follow }
    }
    case 'ghost/add':
      return { ...state, ghosts: [...state.ghosts, action.ghost] }
    case 'ghost/remove':
      return { ...state, ghosts: state.ghosts.filter((g) => g.token !== action.token) }
    case 'save/failed':
      return { ...state, saveFailed: action.count }
    case 'save/clear':
      return { ...state, saveFailed: 0 }
    case 'note/set':
      return { ...state, note: { id: action.id, msg: action.msg } }
    case 'note/clear':
      return state.note === null ? state : { ...state, note: null }
    case 'undo/push':
      return { ...state, undo: action.tray }
    case 'undo/pop':
      return state.undo === null ? state : { ...state, undo: null }
    case 'undo/expire':
      return state.undo !== null && state.undo.seq === action.seq ? { ...state, undo: null } : state
  }
}

export interface Pending {
  readonly date: string
  pos?: CardPos
  size?: CardSize
  patch?: CardPatch
}
