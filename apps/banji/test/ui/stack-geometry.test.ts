// 纸叠几何（纯函数面）：认领/可达/命中/拟合/平移/渲染序——D2-D5 的判据全在这口秤上过。
import { describe, expect, it } from 'vitest'
import type { Card, CardId } from '../../src/domain/types'
import { containerCard, textCard } from '../helpers'
import {
  MAT_MIN, MAT_PAD,
  canNest, detach, fitContainerBounds, fitStacks, hitTestContainer,
  matFitOf, parentIdOf, parentIndex, reattach, renderStackOrder,
  stackIssues, subtreeIds, subtreeTranslate,
} from '../../src/ui/stackGeometry'

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

describe('认领与可达（D3 环护栏的地基）', () => {
  it('认领只算容器的 children；非容器挂 children 不作数；重复认领先到先得', () => {
    const k = paper('g-k')
    const m1 = mat('g-m1', { children: [k.id] })
    const m2 = mat('g-m2', { children: [k.id] })
    const fakeDad = textCard('g-fake', { children: [k.id] })
    expect(parentIdOf([fakeDad, m1, m2], k.id)).toBe(cid('g-m1'))
    expect(parentIndex([fakeDad]).size).toBe(0)
  })

  it('subtreeIds 全树含根；互相认领的病态环也有限步收敛（不死循环）', () => {
    const outer = mat('g-o', { children: [cid('g-i'), cid('g-x')] })
    const inner = mat('g-i', { children: [cid('g-l')] })
    const leaf = paper('g-l')
    const x = paper('g-x')
    expect([...subtreeIds([outer, inner, leaf, x], outer.id)].sort()).toEqual(['g-i', 'g-l', 'g-o', 'g-x'])
    const a = mat('g-a', { children: [cid('g-b')] })
    const b = mat('g-b', { children: [cid('g-a')] })
    expect(subtreeIds([a, b], a.id)).toEqual(new Set(['g-a', 'g-b']))
  })

  it('canNest 四拒：自抱、非容器当爹、拖祖宗入儿孙怀、目标根本不存在', () => {
    const outer = mat('g-c1', { children: [cid('g-c2')] })
    const inner = mat('g-c2', { children: [cid('g-c3')], pos: { x: 450, y: 450 }, size: MAT_MIN })
    const deep = paper('g-c3', { pos: { x: 470, y: 470 } })
    const stray = paper('g-c4', { pos: { x: 50, y: 50 } })
    const cards = [outer, inner, deep, stray]
    expect(canNest(cards, inner.id, inner.id)).toBe(false)
    expect(canNest(cards, stray.id, deep.id)).toBe(false)
    expect(canNest(cards, deep.id, outer.id)).toBe(false)
    expect(canNest(cards, outer.id, cid('g-ghost'))).toBe(false)
    expect(canNest(cards, outer.id, stray.id)).toBe(true)
  })
})

describe('拖入命中（D3）', () => {
  it('指针不在任何垫纸里、纸上无垫纸、压住的不是垫纸：一律 null；压进界内才认领', () => {
    const m = mat('h-m')
    const k = paper('h-k', { pos: { x: 1000, y: 1000 } })
    const other = paper('h-o')
    expect(hitTestContainer({ x: 200, y: 200 }, [m, k], k.id)).toBeNull()
    expect(hitTestContainer({ x: 440, y: 440 }, [k, other], other.id)).toBeNull()
    expect(hitTestContainer({ x: 440, y: 440 }, [m, other], other.id)).toBe(cid('h-m'))
  })

  it('同点压住叠中叠：取渲染序在上的内垫——存储 z 外高内低也不按存储 z 蒙', () => {
    const outer = mat('h-o', { z: 9, children: [cid('h-i')] })
    const inner = mat('h-i', { pos: { x: 470, y: 470 }, size: MAT_MIN, z: 2 })
    const k = paper('h-k')
    expect(renderStackOrder([outer, inner, k]).map((c) => c.id)).toEqual(['h-o', 'h-i', 'h-k'])
    expect(hitTestContainer({ x: 500, y: 500 }, [outer, inner, k], k.id)).toBe(cid('h-i'))
    expect(hitTestContainer({ x: 420, y: 420 }, [outer, inner, k], k.id)).toBe(cid('h-o'))
  })

  it('拖垫纸走：它自己与它的子孙都不许当落点；祖先垫纸仍可收留', () => {
    const outer = mat('h-go', { children: [cid('h-gi')] })
    const inner = mat('h-gi', { pos: { x: 470, y: 470 }, size: MAT_MIN })
    const k = paper('h-gk')
    expect(hitTestContainer({ x: 500, y: 500 }, [outer, inner, k], inner.id)).toBe(cid('h-go'))
    expect(hitTestContainer({ x: 420, y: 420 }, [outer, inner, k], outer.id)).toBeNull()
  })
})

describe('扩边拟合（D5）', () => {
  it('fitContainerBounds：孩子+24 呼吸收进来；只扩不缩；左上越界钳进纸内', () => {
    const cur = { pos: { x: 100, y: 100 }, size: { w: 300, h: 200 } }
    const spillRight = { pos: { x: 380, y: 150 }, size: { w: 120, h: 60 } }
    expect(fitContainerBounds([spillRight], cur)).toEqual({
      pos: { x: 100, y: 100 },
      size: { w: spillRight.pos.x + spillRight.size.w + MAT_PAD - 100, h: 200 },
    })
    const snug = { pos: { x: 150, y: 150 }, size: { w: 40, h: 40 } }
    expect(fitContainerBounds([snug], cur)).toEqual(cur)
    const spillTop = { pos: { x: 5, y: 5 }, size: { w: 40, h: 40 } }
    const grown = fitContainerBounds([spillTop], cur)
    expect(grown.pos).toEqual({ x: 0, y: 0 })
    expect(grown.size.w).toBeGreaterThan(cur.size.w)
  })

  it('空叠与弱叠都站在 220×160 的地板上', () => {
    expect(fitContainerBounds([], { pos: { x: 30, y: 30 }, size: { w: 50, h: 40 } })).toEqual({
      pos: { x: 30, y: 30 },
      size: MAT_MIN,
    })
    expect(MAT_MIN).toEqual({ w: 220, h: 160 })
  })

  it('fitStacks 叠中叠级联一轮到位且幂等：外垫随内垫胀，原始卡一字不动（纯函数）', () => {
    const far = paper('f-k', { pos: { x: 620, y: 600 } })
    const m = mat('f-m', { children: [far.id], pos: { x: 600, y: 600 }, size: MAT_MIN })
    const o = mat('f-o', { children: [m.id], pos: { x: 560, y: 560 }, size: MAT_MIN })
    const before = structuredClone([o, m, far])
    const after = fitStacks([o, m, far])
    expect(pick(after, 'f-m').size.w).toBeGreaterThanOrEqual(620 + 120 + MAT_PAD - 600)
    expect(pick(after, 'f-o').size.w).toBeGreaterThanOrEqual(pick(after, 'f-m').pos.x + pick(after, 'f-m').size.w + MAT_PAD - 560)
    expect(fitStacks(after)).toEqual(after)
    expect([o, m, far]).toEqual(before)
  })

  it('病态环永不收敛：fitStacks 到期原样交出（膨胀的垫纸绝不许落库）', () => {
    const a = mat('f-a', { children: [cid('f-b')], pos: { x: 50, y: 50 }, size: MAT_MIN })
    const b = mat('f-b', { children: [cid('f-a')], pos: { x: 60, y: 60 }, size: MAT_MIN })
    const cards = [a, b]
    expect(fitStacks(cards)).toBe(cards)
  })

  it('matFitOf 只管真容器；非容器与缺卡得 null', () => {
    const k = paper('f-k2')
    const m = mat('f-m2', { children: [k.id] })
    expect(matFitOf([m, k], m.id)).toEqual(fitContainerBounds([k], m))
    expect(matFitOf([m, k], k.id)).toBeNull()
    expect(matFitOf([m, k], cid('f-ghost'))).toBeNull()
  })
})

describe('平移与结构编辑（D5/D3/D4 的笔）', () => {
  it('subtreeTranslate：整树同 delta 且仍画布绝对；delta 0 原引用交出；负越界钳进纸内', () => {
    const k = paper('t-k', { pos: { x: 480, y: 480 } })
    const inner = mat('t-i', { pos: { x: 460, y: 460 }, size: MAT_MIN, children: [k.id] })
    const outer = mat('t-o', { pos: { x: 420, y: 420 }, children: [inner.id] })
    const stray = paper('t-s')
    const cards = [outer, inner, k, stray]
    expect(subtreeTranslate(cards, outer.id, 0, 0)).toBe(cards)
    const moved = subtreeTranslate(cards, outer.id, 30, 25)
    expect(pick(moved, 't-o').pos).toEqual({ x: 450, y: 445 })
    expect(pick(moved, 't-i').pos).toEqual({ x: 490, y: 485 })
    expect(pick(moved, 't-k').pos).toEqual({ x: 510, y: 505 })
    expect(pick(moved, 't-s')).toBe(stray)
    expect(pick(subtreeTranslate(cards, k.id, -1000, -1000), 't-k').pos).toEqual({ x: 0, y: 0 })
  })

  it('reattach 尾挂 + 旧叠即让渡（一父在写入侧成立）；已在叠内幂等；detach 只摘这一个', () => {
    const k = paper('e-k', { pos: { x: 10, y: 10 } })
    const p1 = mat('e-p1', { pos: { x: 10, y: 10 }, children: [k.id] })
    const p2 = mat('e-p2', { pos: { x: 1000, y: 1000 }, children: [] })
    const r = reattach([p1, p2, k], p2.id, k.id)
    expect(pick(r, 'e-p1').children).toEqual([])
    expect(pick(r, 'e-p2').children).toEqual([k.id])
    expect(reattach(r, p2.id, k.id)).toBe(r)
    expect(pick(detach(r, k.id), 'e-p2').children).toEqual([])
  })

  it('拓扑闸与 domain 同口径：两父抢一图、环一图，都从 stackIssues 冒出来', () => {
    const k = paper('q-k')
    const p1 = mat('q-p1', { children: [k.id] })
    const p2 = mat('q-p2', { children: [k.id] })
    expect(stackIssues([p1, p2, k]).map((i) => i.code)).toContain('container.duplicate_parent')
    const a = mat('q-a', { children: [cid('q-b')] })
    const b = mat('q-b', { children: [cid('q-a')] })
    expect(stackIssues([a, b]).map((i) => i.code)).toContain('container.cycle')
    expect(stackIssues([mat('q-c', { children: [k.id] }), k])).toEqual([])
  })
})

describe('渲染序（D2：子纸永远浮在垫纸上，存储 z 一个字节不动）', () => {
  it('垫纸的存储 z 高于子纸也照样垫在下面；叠中叠逐层前置；输出只是序、对象原封', () => {
    const deep = paper('z-d', { z: 1, pos: { x: 480, y: 480 } })
    const inner = mat('z-i', { z: 3, pos: { x: 460, y: 460 }, size: MAT_MIN, children: [deep.id] })
    const outer = mat('z-o', { z: 7, children: [inner.id] })
    const lone = paper('z-l', { z: 2 })
    const cards = [outer, inner, deep, lone]
    const zBefore = cards.map((c) => ({ id: c.id, z: c.z }))
    expect(renderStackOrder(cards).map((c) => c.id)).toEqual(['z-o', 'z-i', 'z-d', 'z-l'])
    expect(cards.map((c) => ({ id: c.id, z: c.z }))).toEqual(zBefore)
  })

  it('无叠之日：渲染序就是 z 升序（与 R1-R4 行为逐位相等）', () => {
    const a = paper('z-a', { z: 3 })
    const b = paper('z-b', { z: 1 })
    expect(renderStackOrder([a, b]).map((c) => c.id)).toEqual(['z-b', 'z-a'])
  })
})
