// graphLayout 纯算（R8·D3）：确定性（双跑深相等、输入序不参与几何）、日期列、createdAt 升序柱内堆叠、
// 孩子缩进悬母片之下、边只认活 chip、空图/单纸边角。全 node 环境——布局层零 DOM。
import { describe, expect, it } from 'vitest'
import { graphLayout, type GraphEntry } from '../src/ui/graphLayout'
import type { CardId, EdgeRecord } from '../src/domain/types'
import { isoAt } from './helpers'

const cid = (v: string): CardId => v as CardId

function entry(id: string, date: string, born = 0, children: string[] = []): GraphEntry {
  return { cardId: cid(id), date, createdAt: isoAt(born), snippet: id, icon: 'text', children: children.map(cid) }
}

const edge = (source: string, target: string): EdgeRecord => ({
  id: `${source}→${target}`,
  source: cid(source),
  target: cid(target),
  createdAt: isoAt(0),
  updatedAt: isoAt(0),
})

describe('graphLayout：确定性与结构', () => {
  it('同输入双跑深相等（确定性是这图的立身之本）', () => {
    const entries = [entry('a', '2026-01-10', 1), entry('b', '2026-01-12', 2, ['c']), entry('c', '2026-01-12', 1), entry('d', '2026-01-11', 3)]
    const edges = [edge('a', 'b'), edge('c', 'd')]
    const one = graphLayout(entries, edges)
    const two = graphLayout(structuredClone(entries), structuredClone(edges))
    expect(structuredClone(one)).toEqual(structuredClone(two))
  })

  it('输入顺序不动几何：乱序喂入与正序喂入逐字段相等', () => {
    const a = entry('a', '2026-01-10', 1)
    const b = entry('b', '2026-01-11', 2)
    const e = edge('a', 'b')
    expect(structuredClone(graphLayout([b, a], [e]))).toEqual(structuredClone(graphLayout([a, b], [e])))
  })

  it('日期列按历法升序排开', () => {
    const layout = graphLayout([entry('x', '2026-01-12'), entry('y', '2026-01-10'), entry('z', '2026-01-11')], [])
    expect(layout.columns.map((c) => c.date)).toEqual(['2026-01-10', '2026-01-11', '2026-01-12'])
    const xs = ['2026-01-10', '2026-01-11', '2026-01-12'].map((d) => layout.chips.find((c) => c.entry.date === d)!.x)
    expect(xs[0]).toBeLessThan(xs[1]!)
    expect(xs[1]).toBeLessThan(xs[2]!)
  })

  it('日内堆叠按 createdAt 升序', () => {
    const layout = graphLayout([entry('late', '2026-01-10', 9), entry('early', '2026-01-10', 1)], [])
    expect(layout.chips.map((c) => c.entry.cardId)).toEqual([cid('early'), cid('late')])
    expect(layout.chips[0]!.y).toBeLessThan(layout.chips[1]!.y)
  })

  it('孩子自成 chip 缩进悬于母片之下（即便孩子出生更早）；隔代再缩一档', () => {
    const layout = graphLayout(
      [entry('kid', '2026-01-10', 1), entry('mat', '2026-01-10', 5, ['kid', 'mid']), entry('mid', '2026-01-10', 2, ['grand']), entry('grand', '2026-01-10', 0)],
      [],
    )
    const byId = new Map(layout.chips.map((c) => [c.entry.cardId, c]))
    const mat = byId.get(cid('mat'))!
    const kid = byId.get(cid('kid'))!
    const grand = byId.get(cid('grand'))!
    expect(layout.chips.map((c) => c.entry.cardId)).toEqual([cid('mat'), cid('kid'), cid('mid'), cid('grand')])
    expect(kid.x).toBeGreaterThan(mat.x)
    expect(kid.y).toBeGreaterThan(mat.y)
    expect(grand.x).toBeGreaterThan(kid.x)
  })

  it('同日柱内互不重叠：每张 chip 占位两两无交', () => {
    const many: GraphEntry[] = Array.from({ length: 12 }, (_, i) => entry(`c${String(i)}`, '2026-01-10', i))
    const layout = graphLayout(many, [])
    for (let i = 0; i < layout.chips.length; i++) {
      for (let j = i + 1; j < layout.chips.length; j++) {
        const a = layout.chips[i]!
        const b = layout.chips[j]!
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
        expect(overlap, `${String(a.entry.cardId)} × ${String(b.entry.cardId)}`).toBe(false)
      }
    }
  })

  it('边端点只认活 chip：悬空一端、双悬空的边都不落笔', () => {
    const layout = graphLayout([entry('a', '2026-01-10'), entry('b', '2026-01-11')], [edge('a', 'b'), edge('a', 'ghost'), edge('g1', 'g2')])
    expect(layout.lines).toHaveLength(1)
    expect(layout.lines[0]?.id).toBe('a→b')
  })

  it('两端同心的病态线（零长贝塞尔 null）不画', () => {
    const layout = graphLayout([entry('a', '2026-01-10'), entry('b', '2026-01-10')], [edge('a', 'a')])
    expect(layout.lines).toHaveLength(0)
  })

  it('无边的图：只有柱与片', () => {
    const layout = graphLayout([entry('a', '2026-01-10'), entry('b', '2026-01-11')], [])
    expect(layout.columns).toHaveLength(2)
    expect(layout.chips).toHaveLength(2)
    expect(layout.lines).toHaveLength(0)
    expect(layout.width).toBeGreaterThan(0)
    expect(layout.height).toBeGreaterThan(0)
  })

  it('单纸日记：一柱一片，面积仍是正数（画得出来）', () => {
    const layout = graphLayout([entry('only', '2026-01-10')], [])
    expect(layout.columns).toHaveLength(1)
    expect(layout.chips).toHaveLength(1)
    expect(layout.height).toBeGreaterThan(0)
  })

  it('空账本：零柱零片零边，面积归零（渲染层据此出耳语）', () => {
    const layout = graphLayout([], [])
    expect(layout.chips).toHaveLength(0)
    expect(layout.width).toBe(0)
    expect(layout.height).toBe(0)
  })

  it('病态互父环：一张纸都不吞（兜底上柱），深度封顶不炸', () => {
    const layout = graphLayout([entry('A', '2026-01-10', 1, ['B']), entry('B', '2026-01-10', 2, ['A']), entry('B2', '2026-01-10', 3, ['A'])], [])
    expect(layout.chips).toHaveLength(3)
  })
})
