// 「撕下 → 再想想」的托盘机（R4 单级：一格、10s 静默过期）独立成一等编排单元。
// 这张机管票据与兴废；restore 排链、strip 意图撤回首都归核心（唯一串行链住 store.ts）。
// 票据住内存：dispatch 注入，undo/push・pop・expire 三式仍由 dayState reducer 落形。
import type { DeleteSnapshot } from '../application'
import type { CardId } from '../domain/types'
import type { Action, Pending } from './dayState'

/** “再想想”的窗口：10 秒，之后纸片安静地归尘（无提醒、无残影）。 */
const UNDO_TTL_MS = 10_000

export interface UndoTicket {
  readonly seq: number
  readonly date: string
  readonly snapshot: DeleteSnapshot
  claimed: boolean
}

export interface UndoTray {
  /** 新的撕下直接顶替旧纸片（被顶掉的不另发声——它本就在倒计时）。 */
  arm(day: string, snapshot: DeleteSnapshot): void
  /** 「再想想」把承诺抢出口：空盘/已领走返回 null；领走后票据转住「在途」栏，只等落笔或导入作废。 */
  claim(): UndoTicket | null
  /** 链头报到处：这张承诺还许落笔吗？导入 ack 落斧即 false（一次性：领报成功同时销账）。 */
  consumeIntent(seq: number): boolean
  /** 宇宙整体替换：待撤与已许诺在途的 restore 同批作废——旧宇宙的纸片绝不复活进新宇宙（R4 安全不变量）。 */
  discard(): void
  /** 仅卸倒计时（组件卸载用；在途与托盘随内存自然消亡）。 */
  disarmTimer(): void
}

export function createUndoTray(dispatch: (action: Action) => void): UndoTray {
  let seq = 0
  let timer: number | null = null
  let ticket: UndoTicket | null = null
  // claimed（已按“再想想”）的 restore 在链上排队时也要保住：它是用户已出口的承诺，只被导入作废。
  let promised: UndoTicket | null = null
  const disarmTimer = (): void => {
    if (timer !== null) {
      window.clearTimeout(timer)
      timer = null
    }
  }
  return {
    arm(day, snapshot) {
      disarmTimer()
      const t: UndoTicket = { seq: ++seq, date: day, snapshot, claimed: false }
      ticket = t
      dispatch({
        type: 'undo/push',
        tray: { seq: t.seq, date: day, snapshot, count: snapshot.cards.length, expiresAt: Date.now() + UNDO_TTL_MS },
      })
      timer = window.setTimeout(() => {
        timer = null
        if (ticket !== null && ticket.seq === t.seq && !ticket.claimed) {
          ticket = null
          dispatch({ type: 'undo/expire', seq: t.seq })
        }
      }, UNDO_TTL_MS)
    },
    claim() {
      const t = ticket
      if (t === null || t.claimed) return null
      t.claimed = true
      disarmTimer()
      ticket = null
      promised = t
      return t
    },
    consumeIntent(wanted) {
      if (promised === null || promised.seq !== wanted) return false
      promised = null
      return true
    },
    discard() {
      promised = null
      disarmTimer()
      ticket = null
      dispatch({ type: 'undo/pop' })
    },
    disarmTimer,
  }
}

/** 「再想想」抢跑未落盘的 strip：撤掉在途/在败意图里的 children 字段（逐字快照复原才是最新意图；其余字段不连坐）。意图箱由核心递进来，本函数只给撤除的配方。 */
export function pruneStripIntent(boxes: Iterable<Map<CardId, Pending>>, parentIds: Iterable<CardId>): void {
  for (const id of parentIds) {
    for (const box of boxes) {
      const e = box.get(id)
      if (e === undefined || e.patch === undefined || !('children' in e.patch)) continue
      const { children: _strip, ...rest } = e.patch
      if (Object.keys(rest).length > 0) e.patch = rest
      else if (e.pos !== undefined || e.size !== undefined) delete e.patch
      else box.delete(id)
    }
  }
}
