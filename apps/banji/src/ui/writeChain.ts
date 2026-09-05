// 唯一串行链的核心（R6 拆分时立的「单链红线」本体，R10·T0 自 store.ts 搬出，行为一字不差）：
// 串行队列 + schedule/diff/flush 纪律 + pending/failed 两箱 + 宇宙代数 worldGen。
// 中介（store.ts）是这条链的唯一持有者：undo 托盘、夹带管线、牵线编排机都借注入的 chain/flushNow
// 回到这同一条链上——绝无第二条链。R10 的导入 commit barrier（T2）也挂在这条链上排队。
import type { Card, CardId } from '../domain/types'
import type { BanjiApp } from '../application'
import type { Action, DayState, Pending } from './dayState'
import { diffIntents } from './stackOps'

const DEBOUNCE_MS = 450

export interface WriteChainDeps {
  readonly app: Pick<BanjiApp, 'updateCard' | 'moveCard' | 'resizeCard'>
  readonly dispatch: (action: Action) => void
  /** 纸面现况的唯一读口径（schedule 的出生日、flush 后的回执熄灭都看它）。 */
  readonly getState: () => DayState
}

export interface WriteChain {
  /** 串行队列：getJournal/addCard/updateCard/move… 全部排一条链，日文档永不并发读-改-写。 */
  chain(fn: () => Promise<unknown>): void
  /**
   * 手势→意图的唯一通道：入箱（last-intent-wins 合并）+ debounce ≤600ms 合并为一次落盘。
   * 日未开（date=null）时静默弃（无归属的编辑无处可写）。
   */
  schedule(id: CardId, mutate: (entry: Pending) => void): void
  /** 把两箱意图结算上链（换日/失焦/再试/夹带前共用同一动作）。 */
  flushNow(): void
  haltDebounce(): void
  /** 纸叠落笔：diffIntents 点名真变了的字段，逐条上 schedule 唯一通道。 */
  commitStack(next: readonly Card[]): void
  /** 落盘失败的意图不丢：住这两箱等下一次落盘陪跑；「再想想」撤 strip 也直接递箱给 prune 配方。 */
  readonly pending: Map<CardId, Pending>
  readonly failed: Map<CardId, Pending>
  /** 宇宙代数 +1：导入 ack（全量替换）落斧时，链上代数不匹配的意图到达链头即弃权（见 flushNow）。 */
  bumpWorldGen(): void
}

export function createWriteChain(deps: WriteChainDeps): WriteChain {
  const pending = new Map<CardId, Pending>()
  // 落盘失败的意图不丢：住这里，等下一次落盘陪跑（last-intent-wins——后到的编辑覆盖旧意图）。
  const failed = new Map<CardId, Pending>()
  let timer: number | null = null
  // 串行链头：一切落盘排一条 promise 链（读-改-写绝不并发）。
  let queue: Promise<unknown> = Promise.resolve()
  // 宇宙代数：导入 ack（全量替换）+1。排入链上但未开火的旧世界意图，链头到达时见代数不匹配即弃权——
  // 与 onUniverseReplaced 同步清两箱一起构成「作废是原子的」（见该动作注释）。
  let worldGen = 0

  const chain = (fn: () => Promise<unknown>): void => {
    queue = queue.then(fn, fn).catch(() => undefined)
  }

  const haltDebounce = (): void => {
    if (timer !== null) {
      window.clearTimeout(timer)
      timer = null
    }
  }

  const flushNow = (): void => {
    haltDebounce()
    // 上次没存上的意图搭这趟车；更新的编辑（若有）已在 pending，天然覆盖旧意图。
    for (const [id, entry] of failed) {
      if (!pending.has(id)) pending.set(id, entry)
    }
    failed.clear()
    const drained = [...pending.entries()]
    pending.clear()
    // 出排水位的意图盖上当时的宇宙代数：ack 若发生在「已出队、未开火」的缝隙里，链头见代数不匹配即弃权。
    const gen = worldGen
    for (const [id, entry] of drained) {
      chain(async () => {
        if (worldGen !== gen) return
        try {
          if (entry.patch !== undefined) await deps.app.updateCard(entry.date, id, entry.patch)
          if (entry.pos !== undefined) await deps.app.moveCard(entry.date, id, entry.pos)
          if (entry.size !== undefined) await deps.app.resizeCard(entry.date, id, entry.size)
          if (failed.size === 0 && deps.getState().saveFailed > 0) deps.dispatch({ type: 'save/clear' })
        } catch {
          failed.set(id, entry)
          deps.dispatch({ type: 'save/failed', count: failed.size })
        }
      })
    }
  }

  const schedule = (id: CardId, mutate: (entry: Pending) => void): void => {
    const current = deps.getState()
    if (current.date === null) return
    const entry: Pending = pending.get(id) ?? failed.get(id) ?? { date: current.date }
    failed.delete(id)
    mutate(entry)
    pending.set(id, entry)
    haltDebounce()
    timer = window.setTimeout(() => flushNow(), DEBOUNCE_MS)
  }

  const commitStack = (next: readonly Card[]): void => {
    const prev = deps.getState().cards
    if (next === prev) return
    deps.dispatch({ type: 'cards/set', cards: next })
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
  }

  return {
    chain,
    schedule,
    flushNow,
    haltDebounce,
    commitStack,
    pending,
    failed,
    bumpWorldGen() {
      worldGen += 1
    },
  }
}
