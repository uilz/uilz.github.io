// 单一内存中介：日文档 + 卡片操作只经过这里（foundation 报告明令：避免并发覆写）。
// 本地 state 乐观更新是唯一视觉真相；一切落库都排进同一串行队列（读-改-写绝不并发），
// 文本/位置/尺寸编辑 debounce ≤600ms 后合并为一次 app.updateCard/moveCard/resizeCard。
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import type { BanjiApp, CardPatch } from '../application'
import type { Card, CardId, CardPos, CardSize } from '../domain/types'
import { cardsByIdOf, collectSubtreeIds } from '../domain/gc'
import { isPlainObject } from '../domain/validation'
import { resolveRenderer } from './cards/registry'

const DEBOUNCE_MS = 450
const Z_CEILING = 500

export interface DayState {
  readonly date: string | null
  readonly loaded: boolean
  readonly cards: readonly Card[]
  readonly selectedId: CardId | null
  readonly editingId: CardId | null
  readonly lastAddedId: CardId | null
}

const initialState: DayState = {
  date: null,
  loaded: false,
  cards: [],
  selectedId: null,
  editingId: null,
  lastAddedId: null,
}

type Action =
  | { readonly type: 'day/open'; readonly date: string }
  | { readonly type: 'day/loaded'; readonly cards: readonly Card[] }
  | { readonly type: 'card/added'; readonly card: Card }
  | { readonly type: 'card/patched'; readonly id: CardId; readonly patch: Partial<Card> }
  | { readonly type: 'cards/removed'; readonly ids: readonly CardId[] }
  | { readonly type: 'cards/set'; readonly cards: readonly Card[] }
  | { readonly type: 'ui/select'; readonly id: CardId | null }
  | { readonly type: 'ui/edit'; readonly id: CardId | null }

function reducer(state: DayState, action: Action): DayState {
  switch (action.type) {
    case 'day/open':
      return { ...initialState, date: action.date }
    case 'day/loaded':
      return { ...state, loaded: true, cards: action.cards }
    case 'card/added':
      // 新落的第一行就该能写：R1 的 add 只有文字卡，直接进编辑态。
      return { ...state, cards: [...state.cards, action.card], selectedId: action.card.id, editingId: action.card.id, lastAddedId: action.card.id }
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
  }
}

interface Pending {
  readonly date: string
  pos?: CardPos
  size?: CardSize
  patch?: CardPatch
}

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
}

export interface DayStore {
  readonly state: DayState
  readonly actions: DayActions
}

function sortByZ(cards: readonly Card[]): readonly Card[] {
  return [...cards].sort((a, b) => (a.z ?? 0) - (b.z ?? 0))
}

export function useDayStore(app: BanjiApp, date: string | null, reloadKey = 0): DayStore {
  const [state, dispatch] = useReducer(reducer, initialState)
  const stateRef = useRef(state)
  stateRef.current = state
  const pendingRef = useRef(new Map<CardId, Pending>())
  const timerRef = useRef<number | null>(null)
  // 串行队列：getJournal/addCard/updateCard/move… 全部排一条链，日文档永不并发读-改-写。
  const queueRef = useRef<Promise<unknown>>(Promise.resolve())
  const loadGenRef = useRef(0)
  const chain = useCallback((fn: () => Promise<unknown>): void => {
    queueRef.current = queueRef.current.then(fn, fn).catch(() => undefined)
  }, [])

  const flushNow = useCallback((): void => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const drained = [...pendingRef.current.entries()]
    pendingRef.current.clear()
    for (const [id, entry] of drained) {
      chain(async () => {
        if (entry.patch !== undefined) await app.updateCard(entry.date, id, entry.patch)
        if (entry.pos !== undefined) await app.moveCard(entry.date, id, entry.pos)
        if (entry.size !== undefined) await app.resizeCard(entry.date, id, entry.size)
      })
    }
  }, [app, chain])

  const schedule = useCallback(
    (id: CardId, mutate: (entry: Pending) => void): void => {
      const current = stateRef.current
      if (current.date === null) return
      const entry: Pending = pendingRef.current.get(id) ?? { date: current.date }
      mutate(entry)
      pendingRef.current.set(id, entry)
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(flushNow, DEBOUNCE_MS)
    },
    [flushNow],
  )

  useEffect(() => {
    flushNow() // 换日前把上一天的未落盘编辑结算进队列
    if (date === null) return
    const gen = ++loadGenRef.current
    dispatch({ type: 'day/open', date })
    chain(async () => {
      const doc = await app.getJournal(date)
      if (loadGenRef.current === gen) dispatch({ type: 'day/loaded', cards: doc?.cards ?? [] })
    })
    return () => {
      loadGenRef.current += 1 // 作废在途加载，只接受最新一次 open 的结果
    }
  }, [date, reloadKey, app, chain, flushNow])

  useEffect(() => () => flushNow(), [flushNow])

  const bringToFront = useCallback(
    (id: CardId): void => {
      const cards = sortByZ(stateRef.current.cards)
      const top = cards.findLast((c) => c.id !== id)
      const maxZ = top?.z ?? 0
      if (maxZ < Z_CEILING) {
        const z = maxZ + 0.5
        dispatch({ type: 'card/patched', id, patch: { z } })
        schedule(id, (e) => {
          e.patch = { ...e.patch, z }
        })
        return
      }
      const renumbered = cards.map((c, i): Card => ({ ...c, z: c.id === id ? cards.length : i + 1 }))
      dispatch({ type: 'cards/set', cards: renumbered })
      for (const c of renumbered) {
        const z = c.z ?? 0
        schedule(c.id, (e) => {
          e.patch = { ...e.patch, z }
        })
      }
    },
    [schedule],
  )

  const actions = useMemo<DayActions>(
    () => ({
      select(id) {
        dispatch({ type: 'ui/select', id })
        if (id !== null) bringToFront(id)
      },
      enterEdit(id) {
        dispatch({ type: 'ui/select', id })
        bringToFront(id)
        dispatch({ type: 'ui/edit', id })
      },
      exitEdit() {
        dispatch({ type: 'ui/edit', id: null })
        flushNow()
      },
      patchProps(id, patch) {
        const card = stateRef.current.cards.find((c) => c.id === id)
        if (card === undefined) return
        const base = isPlainObject(card.props) ? card.props : {}
        const props = { ...base, ...patch }
        dispatch({ type: 'card/patched', id, patch: { props } })
        schedule(id, (e) => {
          e.patch = { ...e.patch, props }
        })
      },
      move(id, pos) {
        dispatch({ type: 'card/patched', id, patch: { pos } })
        schedule(id, (e) => {
          e.pos = pos
        })
      },
      resize(id, size) {
        dispatch({ type: 'card/patched', id, patch: { size } })
        schedule(id, (e) => {
          e.size = size
        })
      },
      remove(id) {
        const day = stateRef.current.date
        if (day === null) return
        flushNow()
        const doomed = collectSubtreeIds(cardsByIdOf([...stateRef.current.cards]), id)
        chain(async () => {
          await app.deleteCardCascade(day, id)
          dispatch({ type: 'cards/removed', ids: [...doomed] })
        })
      },
      addTextCard() {
        const current = stateRef.current
        const day = current.date
        if (day === null) return
        flushNow()
        const renderer = resolveRenderer('text')
        const maxY = current.cards.reduce((m, c) => Math.max(m, c.pos.y + c.size.h), 0)
        const pos: CardPos = { x: 24, y: current.cards.length === 0 ? 24 : maxY + 28 }
        const maxZ = sortByZ(current.cards).at(-1)?.z ?? 0
        chain(async () => {
          const card = await app.addCard(day, {
            kind: 'text',
            props: renderer.emptyDraft(pos),
            pos,
            size: renderer.defaultSize,
            z: maxZ + 1,
          })
          if (stateRef.current.date === day) dispatch({ type: 'card/added', card })
        })
      },
    }),
    [app, bringToFront, chain, flushNow, schedule],
  )

  return { state, actions }
}
