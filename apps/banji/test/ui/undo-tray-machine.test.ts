// @vitest-environment jsdom
// 托盘机（undoTray）单元面：顶替/领走/链头弃权/作废四态与 prune 配方——不起 React。
// 端到端行为（过期上屏、换日、导入作废）由 undo-lifecycle / undo / import-discard 三面钉死；这里只管票据纪律本身。
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DeleteSnapshot } from '../../src/application'
import type { Card, CardId } from '../../src/domain/types'
import type { Action, Pending } from '../../src/ui/dayState'
import { createUndoTray, pruneStripIntent } from '../../src/ui/undoTray'

const cid = (v: string): CardId => v as CardId
const snap = (n: number): DeleteSnapshot => ({
  cards: Array.from({ length: n }, (_, i) => ({ id: cid(`c${String(i)}`) }) as Card),
  parentPatches: [],
})

function makeTray(): { tray: ReturnType<typeof createUndoTray>; actions: Action[] } {
  const actions: Action[] = []
  return { tray: createUndoTray((a) => actions.push(a)), actions }
}
const pushesOf = (as: Action[]): { seq: number; count: number }[] =>
  as.flatMap((a) => (a.type === 'undo/push' ? [{ seq: a.tray.seq, count: a.tray.count }] : []))
const count = (as: Action[], type: Action['type']): number => as.filter((a) => a.type === type).length

afterEach(() => {
  vi.useRealTimers()
})

describe('票据纪律（单级一格、认领一次、链头一票一销）', () => {
  it('given 连撕两张 when 观察 then push 两张 seq 递增、claim 领到的是最新一张（旧的自此不可撤）', () => {
    vi.useFakeTimers()
    const { tray, actions } = makeTray()
    tray.arm('2026-01-15', snap(1))
    tray.arm('2026-01-15', snap(3))
    expect(pushesOf(actions)).toEqual([{ seq: 1, count: 1 }, { seq: 2, count: 3 }])
    const t = tray.claim()
    expect(t?.seq).toBe(2)
    expect(t?.snapshot.cards).toHaveLength(3)
    expect(count(actions, 'undo/expire')).toBe(0)
  })

  it('given 已领走 when 再领/过期/链头销账 then 第二次领为 null、过期静默、consumeIntent 一次性真后才假', () => {
    vi.useFakeTimers()
    const { tray, actions } = makeTray()
    tray.arm('2026-01-15', snap(2))
    const first = tray.claim()
    expect(first).not.toBeNull()
    expect(tray.claim()).toBeNull()
    vi.advanceTimersByTime(11_000) // 过期窗走完：已领走的票不发声（restore 排在链上等报到处）
    expect(count(actions, 'undo/expire')).toBe(0)
    expect(tray.consumeIntent(first?.seq ?? -1)).toBe(true) // 链头到达：领报成功，同时销账
    expect(tray.consumeIntent(first?.seq ?? -1)).toBe(false) // 同票二次报到处拒收
  })

  it('given 未领走 when 链头报到 then 一律拒绝（没有承诺出口就没有落笔资格）', () => {
    vi.useFakeTimers()
    const { tray, actions } = makeTray()
    tray.arm('2026-01-15', snap(1))
    expect(tray.consumeIntent(1)).toBe(false)
    vi.advanceTimersByTime(11_000)
    expect(count(actions, 'undo/expire')).toBe(1) // 未领走：到期静默退场
    expect(tray.consumeIntent(1)).toBe(false)
  })

  it('given 已许诺在途 when discard then 承诺作废、pop 恰一次；机器不死——之后仍可 arm+claim', () => {
    vi.useFakeTimers()
    const { tray, actions } = makeTray()
    tray.arm('2026-01-15', snap(1))
    const promised = tray.claim()
    tray.discard()
    expect(tray.consumeIntent(promised?.seq ?? -1)).toBe(false) // 已许诺的在途 restore 随 ack 弃权
    expect(count(actions, 'undo/pop')).toBe(1)
    tray.arm('2026-01-16', snap(2))
    expect(tray.claim()).not.toBeNull() // ack 毒不到托盘机本体
  })
})

describe('prune 配方（撤 strip 不连坐）', () => {
  it('撤 children 字段；有 pos/size 者留箱（patch 摘净）、只剩 children 者整条除名；再来一次不伤', () => {
    const p = new Map<CardId, Pending>()
    const f = new Map<CardId, Pending>()
    p.set(cid('a'), { date: '2026-01-15', patch: { children: [], props: { text: 'x' } } })
    p.set(cid('b'), { date: '2026-01-15', patch: { children: [] }, pos: { x: 1, y: 2 } })
    f.set(cid('c'), { date: '2026-01-15', patch: { children: [] } })
    pruneStripIntent([p, f], [cid('a'), cid('b'), cid('c')])
    expect(p.get(cid('a'))?.patch).toEqual({ props: { text: 'x' } }) // props 不连坐
    expect(p.get(cid('b'))).toEqual({ date: '2026-01-15', pos: { x: 1, y: 2 } }) // pos 保号、patch 摘净
    expect(f.has(cid('c'))).toBe(false) // 整条意图就是剥离本身 → 除名
    pruneStripIntent([p, f], [cid('a'), cid('b'), cid('c')]) // 幂等
    expect(p.get(cid('a'))?.patch).toEqual({ props: { text: 'x' } })
  })
})
