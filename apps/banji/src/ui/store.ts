// 单一内存中介：日文档 + 卡片操作只经过这里（foundation 报告明令：避免并发覆写）。
// 本地 state 乐观更新是唯一视觉真相；一切落库都排进同一串行队列（读-改-写绝不并发），
// 文本/位置/尺寸编辑 debounce ≤600ms 后合并为一次 app.updateCard/moveCard/resizeCard。
// 编排在此（夹带管线、失败意图陪跑）；状态形状与迁移在 dayState.ts，动作表在 storeTypes.ts。
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import type { BanjiApp } from '../application'
import type { Card, CardId, CardPos } from '../domain/types'
import { cardsByIdOf, collectSubtreeIds } from '../domain/gc'
import { isPlainObject } from '../domain/validation'
import { resolveRenderer } from './cards/registry'
import { attachKind, clampCardPos, dropAt, fitWithin, imageCardSize, imageFitMaxW, scatterPos, viewportWidthNow } from './placement'
import { attachFailureCopy, probeImageSize } from './probe'
import { dayReducer, initialDayState } from './dayState'
import type { Pending } from './dayState'
import type { DayActions, DayStore, DayStoreOptions } from './storeTypes'

export type { DayState, Ghost, Note } from './dayState'
export type { DayActions, DayStore, DayStoreOptions } from './storeTypes'

const DEBOUNCE_MS = 450
const Z_CEILING = 500

function sortByZ(cards: readonly Card[]): readonly Card[] {
  return [...cards].sort((a, b) => (a.z ?? 0) - (b.z ?? 0))
}

export function useDayStore(app: BanjiApp, date: string | null, reloadKey = 0, opts: DayStoreOptions = {}): DayStore {
  const [state, dispatch] = useReducer(dayReducer, initialDayState)
  const stateRef = useRef(state)
  stateRef.current = state
  const pendingRef = useRef(new Map<CardId, Pending>())
  // 落盘失败的意图不丢：住这里，等下一次落盘陪跑（last-intent-wins——后到的编辑覆盖旧意图）。
  const failedRef = useRef(new Map<CardId, Pending>())
  const timerRef = useRef<number | null>(null)
  const ghostSeqRef = useRef(0)
  const noteSeqRef = useRef(0)
  const probe = opts.probe ?? probeImageSize
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
    // 上次没存上的意图搭这趟车；更新的编辑（若有）已在 pendingRef，天然覆盖旧意图。
    for (const [id, entry] of failedRef.current) {
      if (!pendingRef.current.has(id)) pendingRef.current.set(id, entry)
    }
    failedRef.current.clear()
    const drained = [...pendingRef.current.entries()]
    pendingRef.current.clear()
    for (const [id, entry] of drained) {
      chain(async () => {
        try {
          if (entry.patch !== undefined) await app.updateCard(entry.date, id, entry.patch)
          if (entry.pos !== undefined) await app.moveCard(entry.date, id, entry.pos)
          if (entry.size !== undefined) await app.resizeCard(entry.date, id, entry.size)
          if (failedRef.current.size === 0 && stateRef.current.saveFailed > 0) dispatch({ type: 'save/clear' })
        } catch {
          failedRef.current.set(id, entry)
          dispatch({ type: 'save/failed', count: failedRef.current.size })
        }
      })
    }
  }, [app, chain])

  const schedule = useCallback(
    (id: CardId, mutate: (entry: Pending) => void): void => {
      const current = stateRef.current
      if (current.date === null) return
      const entry: Pending = pendingRef.current.get(id) ?? failedRef.current.get(id) ?? { date: current.date }
      failedRef.current.delete(id)
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

  /** 夹带单份文件的完整管线（跑在串行链上）：资产 → 探测 → 卡片，失败则虚影熄灭 + 回执。 */
  const attachOne = useCallback(
    (day: string, file: File, pos: CardPos, token: number, seq: number): void => {
      const kind = attachKind(file.type)
      dispatch({
        type: 'ghost/add',
        ghost: { token, kind, name: file.name, pos, size: resolveRenderer(kind).defaultSize },
      })
      chain(async () => {
        const vanish = (): void => {
          dispatch({ type: 'ghost/remove', token })
        }
        try {
          const record = await app.addAsset(file)
          let props: Record<string, unknown> = { hash: record.hash }
          let size = resolveRenderer(kind).defaultSize
          if (kind === 'image') {
            const nat = await probe(file)
            if (nat !== null) {
              // 创建期定宽公式唯一住在 imageFitMaxW：手机收进屏内，桌面封顶不变。
              const maxW = imageFitMaxW(viewportWidthNow())
              const fit = fitWithin(nat.w, nat.h, maxW)
              props = { hash: record.hash, w: fit.w, h: fit.h }
              size = imageCardSize(nat.w, nat.h, maxW)
            }
          }
          const maxZ = sortByZ(stateRef.current.cards).at(-1)?.z ?? 0
          const card = await app.addCard(day, { kind, props, pos, size, z: maxZ + 1 + seq * 0.5 })
          vanish()
          if (stateRef.current.date === day) dispatch({ type: 'card/added', card, edit: false })
        } catch (err) {
          vanish()
          dispatch({ type: 'note/set', id: ++noteSeqRef.current, msg: attachFailureCopy(err) })
        }
      })
    },
    [app, chain, probe],
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
        const pos = scatterPos(current.cards.length + current.ghosts.length, viewportWidthNow())
        const maxZ = sortByZ(current.cards).at(-1)?.z ?? 0
        chain(async () => {
          const card = await app.addCard(day, {
            kind: 'text',
            props: renderer.emptyDraft(pos),
            pos,
            size: renderer.defaultSize,
            z: maxZ + 1,
          })
          if (stateRef.current.date === day) dispatch({ type: 'card/added', card, edit: true })
        })
      },
      attach(files, at = null) {
        const current = stateRef.current
        const day = current.date
        if (day === null || files.length === 0) return
        flushNow()
        files.forEach((file, k) => {
          const base = at !== null ? dropAt(clampCardPos(at), k) : scatterPos(current.cards.length + current.ghosts.length + k, viewportWidthNow())
          attachOne(day, file, base, ++ghostSeqRef.current, k)
        })
      },
      retrySave() {
        flushNow()
      },
      dismissNote() {
        dispatch({ type: 'note/clear' })
      },
    }),
    [app, attachOne, bringToFront, chain, flushNow, schedule],
  )

  return { state, actions }
}
