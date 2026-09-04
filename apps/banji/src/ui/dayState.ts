// 日中介的状态层 —— 纯 reducer：形状、迁移、ghost/note/回执计数。零 React hooks 之外的编排。
import type { Card, CardId, CardPos, CardSize } from '../domain/types'
import type { CardPatch } from '../application'

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
}

export type Action =
  | { readonly type: 'day/open'; readonly date: string }
  | { readonly type: 'day/loaded'; readonly cards: readonly Card[] }
  | { readonly type: 'card/added'; readonly card: Card; readonly edit: boolean }
  | { readonly type: 'card/patched'; readonly id: CardId; readonly patch: Partial<Card> }
  | { readonly type: 'cards/removed'; readonly ids: readonly CardId[] }
  | { readonly type: 'cards/set'; readonly cards: readonly Card[] }
  | { readonly type: 'ui/select'; readonly id: CardId | null }
  | { readonly type: 'ui/edit'; readonly id: CardId | null }
  | { readonly type: 'ghost/add'; readonly ghost: Ghost }
  | { readonly type: 'ghost/remove'; readonly token: number }
  | { readonly type: 'save/failed'; readonly count: number }
  | { readonly type: 'save/clear' }
  | { readonly type: 'note/set'; readonly id: number; readonly msg: string }
  | { readonly type: 'note/clear' }

export function dayReducer(state: DayState, action: Action): DayState {
  switch (action.type) {
    case 'day/open':
      // 未落盘意图（failedRef）跨日仍住在编排层，回执必须活着陪它。
      return { ...initialDayState, date: action.date, saveFailed: state.saveFailed }
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
      const doomed = new Set<string>(action.ids)
      return {
        ...state,
        cards: state.cards.filter((c) => !doomed.has(c.id)),
        selectedId: state.selectedId !== null && doomed.has(state.selectedId) ? null : state.selectedId,
        editingId: state.editingId !== null && doomed.has(state.editingId) ? null : state.editingId,
      }
    }
    case 'cards/set':
      return { ...state, cards: action.cards }
    case 'ui/select':
      return { ...state, selectedId: action.id }
    case 'ui/edit':
      return { ...state, editingId: action.id }
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
  }
}

export interface Pending {
  readonly date: string
  pos?: CardPos
  size?: CardSize
  patch?: CardPatch
}
