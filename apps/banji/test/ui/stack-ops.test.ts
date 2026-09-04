// 手势→纸面新世界的计划层（纯函数面）：每一式都是 cards → cards' + 判别式，违例死在闸前。
import { describe, expect, it } from 'vitest'
import type { Card, CardId } from '../../src/domain/types'
import { containerCard, textCard } from '../helpers'
import { diffIntents, planAttach, planDetach, planMove, planResize } from '../../src/ui/stackOps'
import { MAT_PAD } from '../../src/ui/stackGeometry'

const cid = (v: string): CardId => v as CardId

function mat(id: string, over: Partial<Card> = {}): Card {
  return containerCard([], { id: cid(id), pos: { x: 400, y: 400 }, size: { w: 300, h: 260 }, z: 5, ...over })
}
function paper(id: string, over: Partial<Card> = {}): Card {
  return textCard(id, { id: cid(id), pos: { x: 20, y: 20 }, size: { w: 120, h: 60 }, z: 9, ...over })
}
function pick(cards: readonly Card[], id: string): Card {
  const c = cards.find((x) => x.id === cid(id))
  if (c === undefined) throw new Error(`夹具缺卡: ${id}`)
  return c
}

describe('planAttach（D3 拖入）', () => {
  it('收编尾挂、孩子落在释放点（画布绝对）、垫纸界内不白胀', () => {
    const m = mat('a-m')
    const k = paper('a-k')
    const plan = planAttach([m, k], m.id, k.id, { x: 430, y: 440 })
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(pick(plan.cards, 'a-m').children).toEqual([k.id])
    expect(pick(plan.cards, 'a-k').pos).toEqual({ x: 430, y: 440 })
    expect(pick(plan.cards, 'a-m').size).toEqual(m.size)
  })

  it('孩子压出界：垫纸按 24px 呼吸自动扩边（D5）', () => {
    const m = mat('a-e', { pos: { x: 100, y: 100 }, size: { w: 220, h: 160 } })
    const k = paper('a-e2')
    const plan = planAttach([m, k], m.id, k.id, { x: 250, y: 200 })
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(pick(plan.cards, 'a-e').size).toEqual({
      w: 250 + 120 + MAT_PAD - 100,
      h: 200 + 60 + MAT_PAD - 100,
    })
  })

  it('旧叠自动让渡：一子一父在计划层就成立', () => {
    const k = paper('a-g')
    const p1 = mat('a-p1', { children: [k.id] })
    const p2 = mat('a-p2', { pos: { x: 800, y: 800 } })
    const plan = planAttach([p1, p2, k], p2.id, k.id, { x: 830, y: 830 })
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(pick(plan.cards, 'a-p1').children).toEqual([])
    expect(pick(plan.cards, 'a-p2').children).toEqual([k.id])
  })

  it('三类拒签：塞进子孙怀里=违例、目标失踪=gone、非容器收不了纸', () => {
    const deep = paper('a-d', { pos: { x: 460, y: 460 } })
    const inner = mat('a-i', { pos: { x: 450, y: 450 }, children: [deep.id] })
    const outer = mat('a-o2', { children: [inner.id] })
    expect(planAttach([outer, inner, deep], inner.id, outer.id, { x: 470, y: 470 })).toEqual({ ok: false, reason: 'nested-illegal' })
    expect(planAttach([outer, deep], outer.id, cid('a-ghost'), { x: 10, y: 10 })).toEqual({ ok: false, reason: 'gone' })
    expect(planAttach([outer, deep], deep.id, outer.id, { x: 10, y: 10 }).ok).toBe(false)
  })

  it('闸前收工：陈旧数据已含两父抢一张时，任何新收编都被 topology 闸拍死（宁可不写）', () => {
    const k = paper('w-k')
    const p1 = mat('w-p1', { children: [k.id] })
    const p2 = mat('w-p2', { pos: { x: 900, y: 900 }, children: [k.id] })
    const fresh = paper('w-f')
    expect(planAttach([p1, p2, k, fresh], p1.id, fresh.id, { x: 430, y: 440 })).toEqual({ ok: false, reason: 'nested-illegal' })
  })
})

describe('planDetach（D4 拖出）', () => {
  it('从垫纸抽出独立落定：children 摘净，旧垫纸只扩不缩（D5 的诚实）', () => {
    const k = paper('dd-k', { pos: { x: 430, y: 440 } })
    const m = mat('dd-m', { children: [k.id] })
    const plan = planDetach([m, k], k.id, { x: 30, y: 40 })
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(pick(plan.cards, 'dd-m').children).toEqual([])
    expect(pick(plan.cards, 'dd-m').size).toEqual(m.size)
    expect(pick(plan.cards, 'dd-k').pos).toEqual({ x: 30, y: 40 })
  })

  it('抽自己带叠的子叠：子纸随纸身走，整棵独立', () => {
    const g = paper('dd-g', { pos: { x: 490, y: 495 } })
    const inner = mat('dd-i', { pos: { x: 460, y: 462 }, size: { w: 240, h: 180 }, children: [g.id] })
    const outer = mat('dd-o', { children: [inner.id] })
    const plan = planDetach([outer, inner, g], inner.id, { x: 20, y: 20 })
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(pick(plan.cards, 'dd-o').children).toEqual([])
    expect(pick(plan.cards, 'dd-i').pos).toEqual({ x: 20, y: 20 })
    expect(pick(plan.cards, 'dd-g').pos).toEqual({ x: 50, y: 53 })
  })
})

describe('planMove / planResize / diffIntents', () => {
  it('普通卡走位；垫纸被拖 = 整树平移；负越界钳进纸内', () => {
    const k = paper('mv-k', { pos: { x: 430, y: 440 } })
    const m = mat('mv-m', { children: [k.id] })
    const solo = paper('mv-s')
    const movedSolo = planMove([m, k, solo], solo.id, { x: 120, y: 130 })
    expect(movedSolo.ok).toBe(true)
    if (!movedSolo.ok) return
    expect(pick(movedSolo.cards, 'mv-s').pos).toEqual({ x: 120, y: 130 })
    const draggedMat = planMove([m, k, solo], m.id, { x: 500, y: 520 })
    expect(draggedMat.ok).toBe(true)
    if (!draggedMat.ok) return
    expect(pick(draggedMat.cards, 'mv-k').pos).toEqual({ x: 530, y: 560 })
    const clamped = planMove([solo], solo.id, { x: -50, y: -50 })
    expect(clamped.ok === true && pick(clamped.cards, 'mv-s').pos).toEqual({ x: 0, y: 0 })
    expect(planMove([solo], cid('mv-ghost'), { x: 1, y: 1 })).toEqual({ ok: false, reason: 'gone' })
  })

  it('手工 resize 钳到 [fit, +∞)：缩不过面上的纸+呼吸，放大自由；非容器原样', () => {
    const k = paper('rz-k', { pos: { x: 100, y: 100 } })
    const m = mat('rz-m', { pos: { x: 0, y: 0 }, size: { w: 220, h: 160 }, children: [k.id] })
    const shrunk = planResize([m, k], m.id, { w: 50, h: 40 })
    expect(shrunk.ok).toBe(true)
    if (!shrunk.ok) return
    expect(pick(shrunk.cards, 'rz-m').size).toEqual({ w: 100 + 120 + MAT_PAD, h: 100 + 60 + MAT_PAD })
    const grown = planResize([m, k], m.id, { w: 500, h: 500 })
    expect(grown.ok === true && pick(grown.cards, 'rz-m').size).toEqual({ w: 500, h: 500 })
    const solo = planResize([paper('rz-s')], cid('rz-s'), { w: 33, h: 44 })
    expect(solo.ok === true && pick(solo.cards, 'rz-s').size).toEqual({ w: 33, h: 44 })
  })

  it('差分只点名真变了的字段：幂等 fit 之后零意图；拖入一轮 = 孩子 pos + 垫纸 children', () => {
    const m = mat('di-m')
    const k = paper('di-k')
    const cards = [m, k]
    expect(diffIntents(cards, cards.map((c) => ({ ...c })))).toEqual([])
    const plan = planAttach(cards, m.id, k.id, { x: 900, y: 900 })
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    const deltas = diffIntents(cards, plan.cards)
    expect(deltas).toHaveLength(2)
    expect(deltas.find((d) => d.id === k.id)).toEqual({ id: k.id, pos: { x: 900, y: 900 } })
    const md = deltas.find((d) => d.id === m.id)
    expect(md?.children).toEqual([k.id])
    expect(md?.size).toEqual({ w: 900 + 120 + MAT_PAD - 400, h: 900 + 60 + MAT_PAD - 400 })
  })
})
