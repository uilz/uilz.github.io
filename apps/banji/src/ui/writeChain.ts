// 唯一串行链的核心（R6 拆分时立的「单链红线」本体，R10·T0 自 store.ts 搬出，行为一字不差）：
// 串行队列 + schedule/diff/flush 纪律 + pending/failed 两箱 + 宇宙代数 worldGen。
// 中介（store.ts）是这条链的唯一持有者：undo 托盘、夹带管线、牵线编排机都借注入的 chain/flushNow
// 回到这同一条链上——绝无第二条链。R10 的导入 commit barrier（T2）也挂在这条链上排队。
import type { Card, CardId } from '../domain/types'
import type { BanjiApp } from '../application'
import type { Action, DayState, Pending } from './dayState'
import { diffIntents } from './stackOps'

const DEBOUNCE_MS = 450

/**
 * 落盘失败的根因三分（R11·D1，七度债收口）：唯一分类点在链条的 catch 边界，回执按类配文案。
 * quota = 设备空间见底（给出路：导出旧手札）；drift = 程序/数据漂移（非法日期、无日志、无此卡等
 * 契约内不可能到达的失败）；unknown = 其余。三类共用 R2 的驻留回执通道——零新 UI 通道。
 */
export type SaveRootCause = 'quota' | 'drift' | 'unknown'

const QUOTA_NAMES: ReadonlySet<string> = new Set(['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED'])
/** 程序/数据漂移类：application 层抛的文档/卡片寻址错（浏览器 IDB 侧同族以 DOMException 名呈现）。 */
const DRIFT_NAMES: ReadonlySet<string> = new Set(['InvalidDateError', 'JournalNotFoundError', 'CardNotFoundError', 'InvalidRestoreError', 'NotFoundError', 'ConstraintError'])
/** 旧式 DOMException 以数字 code 报配额（老 WebKit=22、老 Gecko/Blink=1014），name 可能缺席。 */
const QUOTA_LEGACY_CODES: ReadonlySet<number> = new Set([22, 1014])

function shapeOfLegacy(err: unknown): { readonly name: string; readonly code: number } {
  if (err instanceof DOMException || err instanceof Error) {
    const code = (err as { code?: unknown }).code
    return { name: err.name, ...(typeof code === 'number' ? { code } : { code: 0 }) }
  }
  if (typeof err === 'object' && err !== null) {
    const like = err as { name?: unknown; code?: unknown }
    return {
      name: typeof like.name === 'string' ? like.name : '',
      code: typeof like.code === 'number' ? like.code : 0,
    }
  }
  return { name: '', code: 0 }
}

/** 纯函数：任何被 catch 的落笔失败 → 根因类。真 DOMException/Error/legacy {name,code} 形状全部收得。 */
export function classifySaveError(err: unknown): SaveRootCause {
  const { name, code } = shapeOfLegacy(err)
  if (QUOTA_NAMES.has(name) || QUOTA_LEGACY_CODES.has(code)) return 'quota'
  if (DRIFT_NAMES.has(name)) return 'drift'
  return 'unknown'
}

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
  /**
   * R10·债#5 提交屏障：导入 commit 作为普通链上环节走同一条链（单链红线守死——门缝注入，绝不另起二链）。
   * 排入即（这一同步刻）代数 ++：其后一切旧世界意图——连同「已出队未开火」的链上项——到链头弃权；
   * 已在途（开火后卡在 app 层多事务缝隙里）的由链前缀自然静等落定，其写全部先于 commit 事务诞生→被清。
   * 成功：在链环内先落弃世整斧（onSwap 全同步），再放 ack——链上后继项绝无可能在作废前开火。
   * 失败：旧世界还活着——被屏障弃权的意图逐场复活重上链（last-intent-wins 字段并集，绝不静默吞笔）。
   */
  runBarrier<T>(task: () => Promise<T>, onSwap: () => void): Promise<T>
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
  // R10 屏障账：barraged=屏障在岗（弃权按代数对照），barrierGen=排入刻的代数（旧/新意图的分水岭），
  // rescued=被屏障弃权的链上意图（commit 失败复活），armed=排入后仍会开火的新世界意图（绝不被复活覆盖）。
  let barraged = false
  let barrierGen = 0
  const rescued = new Map<CardId, Pending>()
  const armed = new Map<CardId, Pending>()

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
      // 屏障排入后才出队的意图（代数=屏障刻）注定在新宇宙开火或弃权，记账防 commit 失败时复活盖过它。
      if (barraged && gen === barrierGen) arm(id, entry)
      chain(async () => {
        if (worldGen !== gen) {
          // 弃权分两种：屏障在岗且代数停在与排入刻同值——commit 尚未见分晓，这一笔留着可能复活（债#5）；
          // 其余（ack 整斧式作废）按 R6 原口径静默弃。
          if (barraged && worldGen === barrierGen) rescue(id, entry)
          return
        }
        try {
          if (entry.patch !== undefined) await deps.app.updateCard(entry.date, id, entry.patch)
          if (entry.pos !== undefined) await deps.app.moveCard(entry.date, id, entry.pos)
          if (entry.size !== undefined) await deps.app.resizeCard(entry.date, id, entry.size)
          if (failed.size === 0 && deps.getState().saveFailed > 0) deps.dispatch({ type: 'save/clear' })
        } catch (err) {
          failed.set(id, entry)
          deps.dispatch({ type: 'save/failed', count: failed.size, cause: classifySaveError(err) })
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

  /** 意图的字段并集（last-intent-wins 同口径）：同字段新值赢，异字段都保——复活绝不吞候选。 */
  const mergePending = (stale: Pending, fresh: Pending): Pending => {
    const merged: Pending = { date: fresh.date }
    const pos = fresh.pos ?? stale.pos
    const size = fresh.size ?? stale.size
    if (pos !== undefined) merged.pos = pos
    if (size !== undefined) merged.size = size
    const patch = fresh.patch !== undefined || stale.patch !== undefined
      ? { ...stale.patch, ...fresh.patch }
      : undefined
    if (patch !== undefined) merged.patch = patch
    return merged
  }

  const rescue = (id: CardId, entry: Pending): void => {
    const prev = rescued.get(id)
    rescued.set(id, prev === undefined ? entry : mergePending(prev, entry))
  }

  const arm = (id: CardId, entry: Pending): void => {
    const prev = armed.get(id)
    armed.set(id, prev === undefined ? entry : mergePending(prev, entry))
  }

  /** commit 失败的复活：弃权意图重入 pending 箱并即刻结算——旧世界还活着，一笔都不能白弃。 */
  const revive = (): void => {
    barraged = false
    barrierGen = 0
    const had = rescued.size > 0
    for (const [id, stale] of rescued) {
      const fresh = pending.get(id) ?? armed.get(id)
      pending.set(id, fresh === undefined ? stale : mergePending(stale, fresh))
    }
    rescued.clear()
    armed.clear()
    if (had) flushNow() // 当前代数重盖章上链（无新屏障，正常开火进依旧在盘的旧世界）
  }

  const runBarrier = <T>(task: () => Promise<T>, onSwap: () => void): Promise<T> => {
    // 排入即落斧（全同步、无 await）：代数 ++ 先于任何后续出队盖章，也先于任何已在链上的未到链头意图开火。
    worldGen += 1
    barrierGen = worldGen
    barraged = true
    rescued.clear()
    armed.clear()
    let settle!: (value: T) => void
    let reject!: (reason: unknown) => void
    const gate = new Promise<T>((res, rej) => {
      settle = res
      reject = rej
    })
    chain(async () => {
      try {
        const result = await task() // 此刻链前缀（含在途开火的最后一笔 IDB 事务）已全部诞生在 commit 之前
        onSwap() // 整斧在链环内、ack 放行前落定：代数再 ++、两箱/定时器/回执/托盘/瞬态同批弃世
        barraged = false
        barrierGen = 0
        rescued.clear()
        armed.clear()
        settle(result)
      } catch (err) {
        revive()
        reject(err) // 错只经 gate 递出（链继续空转，绝不卡死）
      }
    })
    return gate
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
    runBarrier,
  }
}
