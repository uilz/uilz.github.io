// 单一内存中介：日文档 + 卡片操作只经过这里（foundation 报告明令：避免并发覆写）。
// 本地 state 乐观更新是唯一视觉真相；一切落库都排进同一串行队列（读-改-写绝不并发），
// 文本/位置/尺寸编辑 debounce ≤600ms 后合并为一次 app.updateCard/moveCard/resizeCard。
// 本模块只剩共享核心：串行链 + schedule/diff 纪律 + 动作表；两台一等编排机在兄弟模块——
// 撕下托盘在 undoTray.ts，夹带管线在 attachPipeline.ts（它们借 chain/dispatch 注入回这唯一一条链）；
// 状态形状与迁移在 dayState.ts，动作表签名在 storeTypes.ts。
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import type { BanjiApp } from '../application'
import type { Card, CardId } from '../domain/types'
import { cardsByIdOf, collectSubtreeIds } from '../domain/gc'
import { isPlainObject } from '../domain/validation'
import { resolveRenderer } from './cards/registry'
import { scatterPos, viewportWidthNow } from './placement'
import { probeImageSize } from './probe'
import { dayReducer, initialDayState } from './dayState'
import type { Pending } from './dayState'
import { buildDeleteSnapshot, stripDoomedRefs } from './undoSnapshot'
import { createUndoTray, pruneStripIntent } from './undoTray'
import { createLinkOps } from './lineOps'
import { createAttachPipeline } from './attachPipeline'
import { sortByZ } from './stackGeometry'
import { ATTACH_REJECTED_COPY, DETACH_REJECTED_COPY, diffIntents, planAttach, planDetach, planMove, planResize } from './stackOps'
import type { StackPlan } from './stackOps'
import type { DayActions, DayStore, DayStoreOptions } from './storeTypes'

export type { DayState, Ghost, Note, UndoTray } from './dayState'
export type { DayActions, DayStore, DayStoreOptions } from './storeTypes'

const DEBOUNCE_MS = 450
const Z_CEILING = 500

export function useDayStore(app: BanjiApp, date: string | null, reloadKey = 0, opts: DayStoreOptions = {}): DayStore {
  const [state, dispatch] = useReducer(dayReducer, initialDayState)
  const stateRef = useRef(state)
  stateRef.current = state
  const pendingRef = useRef(new Map<CardId, Pending>())
  // 落盘失败的意图不丢：住这里，等下一次落盘陪跑（last-intent-wins——后到的编辑覆盖旧意图）。
  const failedRef = useRef(new Map<CardId, Pending>())
  const timerRef = useRef<number | null>(null)
  const noteSeqRef = useRef(0)
  const probe = opts.probe ?? probeImageSize
  // 串行队列：getJournal/addCard/updateCard/move… 全部排一条链，日文档永不并发读-改-写。
  const queueRef = useRef<Promise<unknown>>(Promise.resolve())
  const loadGenRef = useRef(0)
  // 宇宙代数：导入 ack（全量替换）+1。排入链上但未开火的旧世界意图，链头到达时见代数不匹配即弃权——
  // 与 onUniverseReplaced 同步清 pendingRef/failedRef 一起构成「作废是原子的」（见该动作注释）。
  const worldGenRef = useRef(0)
  const chain = useCallback((fn: () => Promise<unknown>): void => {
    queueRef.current = queueRef.current.then(fn, fn).catch(() => undefined)
  }, [])

  const haltDebounce = useCallback((): void => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const flushNow = useCallback((): void => {
    haltDebounce()
    // 上次没存上的意图搭这趟车；更新的编辑（若有）已在 pendingRef，天然覆盖旧意图。
    for (const [id, entry] of failedRef.current) {
      if (!pendingRef.current.has(id)) pendingRef.current.set(id, entry)
    }
    failedRef.current.clear()
    const drained = [...pendingRef.current.entries()]
    pendingRef.current.clear()
    // 出排水位的意图盖上当时的宇宙代数：ack 若发生在「已出队、未开火」的缝隙里，链头见代数不匹配即弃权。
    const gen = worldGenRef.current
    for (const [id, entry] of drained) {
      chain(async () => {
        if (worldGenRef.current !== gen) return
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
  }, [app, chain, haltDebounce])

  const schedule = useCallback(
    (id: CardId, mutate: (entry: Pending) => void): void => {
      const current = stateRef.current
      if (current.date === null) return
      const entry: Pending = pendingRef.current.get(id) ?? failedRef.current.get(id) ?? { date: current.date }
      failedRef.current.delete(id)
      mutate(entry)
      pendingRef.current.set(id, entry)
      haltDebounce()
      timerRef.current = window.setTimeout(flushNow, DEBOUNCE_MS)
    },
    [flushNow, haltDebounce],
  )

  // 牵线编排机（第三台一等单元）先于开日 effect 就位：loadForDay 借这唯一一条链拉线账。
  const linking = useMemo(() => createLinkOps({ app, chain, dispatch, getState: () => stateRef.current }), [app, chain, dispatch])

  useEffect(() => {
    flushNow() // 换日前把上一天的未落盘编辑结算进队列
    if (date === null) return
    const gen = ++loadGenRef.current
    dispatch({ type: 'day/open', date })
    linking.loadForDay(date, () => loadGenRef.current === gen)
    return () => {
      loadGenRef.current += 1 // 作废在途加载，只接受最新一次 open 的结果
    }
  }, [date, reloadKey, app, flushNow, linking])

  const bringToFront = useCallback(
    (id: CardId): void => {
      const cards = sortByZ(stateRef.current.cards)
      const maxZ = cards.findLast((c) => c.id !== id)?.z ?? 0
      if (maxZ < Z_CEILING) {
        const z = maxZ + 0.5
        dispatch({ type: 'card/patched', id, patch: { z } })
        schedule(id, (e) => { e.patch = { ...e.patch, z } })
        return
      }
      const renumbered = cards.map((c, i): Card => ({ ...c, z: c.id === id ? cards.length : i + 1 }))
      dispatch({ type: 'cards/set', cards: renumbered })
      for (const c of renumbered) schedule(c.id, (e) => { e.patch = { ...e.patch, z: c.z ?? 0 } })
    },
    [schedule],
  )

  const commitStack = useCallback(
    (next: readonly Card[]): void => {
      const prev = stateRef.current.cards
      if (next === prev) return
      dispatch({ type: 'cards/set', cards: next })
      const prevById = new Map(prev.map((c) => [c.id, c]))
      for (const delta of diffIntents(prev, next)) {
        const old = prevById.get(delta.id)
        if (old === undefined) continue
        schedule(delta.id, (e) => {
          if (delta.pos !== undefined && (e.pos === undefined || e.pos.x !== delta.pos.x || e.pos.y !== delta.pos.y)) e.pos = delta.pos
          if (delta.size !== undefined && (e.size === undefined || e.size.w !== delta.size.w || e.size.h !== delta.size.h)) e.size = delta.size
          if (delta.children !== undefined) e.patch = { ...e.patch, children: delta.children }
        })
      }
    },
    [schedule],
  )

  const tray = useMemo(() => createUndoTray(dispatch), [dispatch])
  const nextNoteId = useCallback((): number => ++noteSeqRef.current, [])
  const attaching = useMemo(
    () => createAttachPipeline({ app, chain, dispatch, getState: () => stateRef.current, probe, nextNoteId, flushNow }),
    [app, chain, dispatch, probe, nextNoteId, flushNow],
  )

  /** 四式手势（挪/缩/入叠/断奶）共用的落笔口径：闸下拒签=意图丢弃+一句人话（gone 只来自陈旧双开，静默弃）；放行=过 diff→schedule 唯一通道。 */
  const runPlan = useCallback(
    (plan: StackPlan, rejectNote: string | null): void => {
      if (plan.ok) { commitStack(plan.cards); return }
      if (rejectNote !== null && plan.reason === 'nested-illegal') dispatch({ type: 'note/set', id: nextNoteId(), msg: rejectNote })
    },
    [commitStack, nextNoteId],
  )

  useEffect(
    () => () => {
      flushNow()
      tray.disarmTimer()
      linking.dispose()
    },
    [flushNow, tray, linking],
  )

  const actions = useMemo<DayActions>(
    () => ({
      ...linking,
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
        schedule(id, (e) => { e.patch = { ...e.patch, props } })
      },
      move(id, pos) {
        runPlan(planMove(stateRef.current.cards, id, pos), null)
      },
      resize(id, size) {
        runPlan(planResize(stateRef.current.cards, id, size), null)
      },
      attachChild(parentId, childId, childPos) {
        runPlan(planAttach(stateRef.current.cards, parentId, childId, childPos), ATTACH_REJECTED_COPY)
      },
      detachChild(childId, pos) {
        runPlan(planDetach(stateRef.current.cards, childId, pos), DETACH_REJECTED_COPY)
      },
      setDropTarget: (id) => dispatch({ type: 'ui/drop-target', id }),
      setDragFollow: (follow) => dispatch({ type: 'ui/drag-follow', follow }),
      setGaze: (gaze, anchor) => dispatch({ type: 'ui/gaze', gaze, anchor }),
      setLineChip: (id) => dispatch({ type: 'line/chip', id }),
      createContainer: () => attaching.spawn('container', false),
      remove(id) {
        const day = stateRef.current.date
        if (day === null) return
        flushNow()
        // 撕下前拍快照：级联之后磁盘只剩 filter 的结果，UI 状态是这批纸片的最后一份完整图景。
        const all = [...stateRef.current.cards]
        const doomed = collectSubtreeIds(cardsByIdOf(all), id)
        const { snapshot } = buildDeleteSnapshot(all, doomed, stateRef.current.links)
        chain(async () => {
          await app.deleteCardCascade(day, id)
          dispatch({ type: 'cards/removed', ids: [...doomed] })
          // prune-at-delete-commit：幸存父卡的 children 悬空引用同批改写（同一条 debounce 串行链，
          // last-intent-wins 与失败回执都是现成通道；撤销凭 parentPatches 按原 index 复原）。
          commitStack(stripDoomedRefs(stateRef.current.cards.filter((c) => !doomed.has(c.id)), doomed))
          tray.arm(day, snapshot)
        })
      },
      addTextCard: () => attaching.spawn('text', true),
      attach(files, at = null) {
        if (stateRef.current.date === null || files.length === 0) return
        flushNow() // 夹带前先结算在途编辑：新纸落在最新的账上
        attaching.attach(files, at)
      },
      retrySave: flushNow,
      undoDelete() {
        const ticket = tray.claim()
        if (ticket === null) return
        pruneStripIntent([pendingRef.current, failedRef.current], new Set(ticket.snapshot.parentPatches.map((p) => p.parentId)))
        dispatch({ type: 'undo/pop' })
        chain(async () => {
          if (!tray.consumeIntent(ticket.seq)) return // 落笔前宇宙已被替换：这张承诺随作废作废
          await app.restoreCards(ticket.date, ticket.snapshot)
          if (stateRef.current.date === ticket.date) {
            dispatch({ type: 'cards/restored', cards: ticket.snapshot.cards, parentPatches: ticket.snapshot.parentPatches })
            // D4 的 undo 腿：线随纸同批回位——缝里已逐字重插，内存账同批重接（两本账不两样）。
            dispatch({ type: 'links/merge', edges: ticket.snapshot.edgePatches ?? [] })
          }
        })
      },
      onUniverseReplaced() {
        // 导入 ack = 宇宙整体替换，一切旧世界的在途之物同批作废（与 R4 托盘作废同一被接受的取舍）：
        // ①worldGen++ 杀死「已排水未开火」的链上意图；②定时器+两箱意图清空杀死尚未出队的；
        // ③失败回执与失败箱同灭（新宇宙没有欠账）；④托盘与已许诺 restore 作废（undoTray.discard）；
        // ⑤拖拽瞬态越过替换即无意义，同拍熄灭。
        // atomicity：本函数全同步、无 await，且在 App.onImported 里先于 reloadKey bump 执行——
        // 换日 effect 的 flushNow 只能在清空之后跑，队列绝无半排半弃的中间态。
        worldGenRef.current += 1
        haltDebounce()
        pendingRef.current.clear()
        failedRef.current.clear()
        dispatch({ type: 'save/clear' })
        tray.discard()
        dispatch({ type: 'ui/drop-target', id: null })
        dispatch({ type: 'ui/drag-follow', follow: null })
        dispatch({ type: 'links/set', links: [] })
        dispatch({ type: 'ui/linking', id: null })
        dispatch({ type: 'ui/gaze', gaze: 'cards', anchor: null })
        dispatch({ type: 'line/chip', id: null })
        linking.dispose()
      },
      dismissNote: () => dispatch({ type: 'note/clear' }),
    }),
    [app, attaching, bringToFront, chain, commitStack, flushNow, linking, runPlan, schedule, tray],
  )

  return { state, actions }
}
