// 牵线/撕线的编排机（R7 第三台一等单元，undoTray/attachPipeline 同乡）：
// 手势判别与串行链的接线都住这里——中介只留一行委派，唯一一链仍在 store.ts。
// 落定（180ms 安分）与收线（取消）都是瞬态视觉，永不过缝。
import type { BanjiApp } from '../application'
import type { CardId } from '../domain/types'
import type { Action, DayState } from './dayState'

/** 牵成后两纸落定的时长：与 .bj-settle 动画同尺（180ms），到点即熄。 */
const SETTLE_MS = 200

export interface LineDispatch {
  readonly app: BanjiApp
  readonly chain: (fn: () => Promise<unknown>) => void
  readonly dispatch: (action: Action) => void
  readonly getState: () => DayState
}

export interface LinkOps {
  /** ⋯「牵线」：同卡再点即收线（自我反悔同一手势，R5 D7 口径——不占托盘）。 */
  startLinking(id: CardId): void
  cancelLinking(): void
  /** 点到靶纸：即刻收线；缝判重（同对/自环/端点无卡返回 null），真牵成才上账、落定。 */
  linkTo(target: CardId): void
  /** 撕线（D3）：无 undo——重新牵一次就是同一只手反过来，自我可逆。 */
  removeLine(id: string): void
  /** 开日随纸载入线账（触及本日卡片的边）；live 由核心的加载代数把门。 */
  loadForDay(date: string, live: () => boolean): void
  /** 组件卸载：掐掉未及熄灭的落定计时。 */
  dispose(): void
}

export function createLinkOps({ app, chain, dispatch, getState }: LineDispatch): LinkOps {
  let settleTimer: number | null = null
  const clearSettle = (): void => {
    if (settleTimer !== null) {
      window.clearTimeout(settleTimer)
      settleTimer = null
    }
  }
  return {
    startLinking(id) {
      dispatch({ type: 'ui/linking', id: getState().linkFromId === id ? null : id })
    },
    cancelLinking() {
      dispatch({ type: 'ui/linking', id: null })
    },
    linkTo(target) {
      const from = getState().linkFromId
      dispatch({ type: 'ui/linking', id: null })
      if (from === null) return
      chain(async () => {
        const edge = await app.addEdge(from, target)
        if (edge === null) return
        dispatch({ type: 'links/merge', edges: [edge] })
        clearSettle()
        dispatch({ type: 'link/settle', ids: [from, target] })
        settleTimer = window.setTimeout(() => {
          settleTimer = null
          dispatch({ type: 'link/settle', ids: [] })
        }, SETTLE_MS)
      })
    },
    removeLine(id) {
      chain(async () => {
        await app.deleteEdge(id)
        dispatch({ type: 'link/remove', id })
      })
    },
    loadForDay(date, live) {
      chain(async () => {
        const doc = await app.getJournal(date)
        if (!live()) return
        dispatch({ type: 'day/loaded', cards: doc?.cards ?? [] })
        const links = await app.listEdgesForCards((doc?.cards ?? []).map((c) => c.id))
        if (live()) dispatch({ type: 'links/set', links })
      })
    },
    dispose: clearSettle,
  }
}
