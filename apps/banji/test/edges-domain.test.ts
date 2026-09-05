// 关系域纯函数面：配对键、级联选择、BFS 串线。零 I/O，全在内存里判。
import { describe, expect, it } from 'vitest'
import { edgesTouching, pairKey, threadOrder } from '../src/domain/edges'
import type { CardId, EdgeRecord } from '../src/domain/types'
import { isoAt } from './helpers'

const id = (s: string): CardId => s as CardId

function edge(source: CardId, target: CardId, n = 0): EdgeRecord {
  return { id: `e#${String(n)}`, source, target, createdAt: isoAt(n), updatedAt: isoAt(n) }
}

describe('pairKey（无序配对键）', () => {
  it('两个方向折到同一个键', () => {
    expect(pairKey(id('a'), id('b'))).toBe(pairKey(id('b'), id('a')))
  })

  it('不同对不碰撞；自配也成键（闸口另判）', () => {
    expect(pairKey(id('a'), id('b'))).not.toBe(pairKey(id('a'), id('c')))
    expect(pairKey(id('a'), id('a'))).toBe('a|a')
  })
})

describe('edgesTouching（级联选边）', () => {
  it('source 或 target 命中集合即选中，两端都在也只出一份', () => {
    const edges = [edge(id('a'), id('x'), 1), edge(id('b'), id('a'), 2), edge(id('x'), id('y'), 3)]
    const out = edgesTouching(edges, new Set([id('a'), id('b')]))
    expect(out.map((e) => e.id)).toEqual(['e#1', 'e#2'])
  })
})

describe('threadOrder（线模式 BFS）', () => {
  const dates = new Map<string, string>()
  const dateOf = (c: CardId): string => dates.get(c) ?? '2026-01-01'

  it('链式：甲—乙—丙 距离升序', () => {
    const edges = [edge(id('jiǎ'), id('yǐ'), 1), edge(id('yǐ'), id('bǐng'), 2)]
    const out = threadOrder(id('jiǎ'), edges, dateOf)
    expect(out).toEqual([
      { cardId: id('jiǎ'), depth: 0 },
      { cardId: id('yǐ'), depth: 1 },
      { cardId: id('bǐng'), depth: 2 },
    ])
  })

  it('跨日分支：同层平级按日期升序（昨天的珠先于今天的）', () => {
    dates.clear()
    dates.set('anchor', '2026-03-05')
    dates.set('near', '2026-03-04')
    dates.set('far', '2026-03-01')
    const edges = [edge(id('anchor'), id('near'), 1), edge(id('anchor'), id('far'), 2)]
    const out = threadOrder(id('anchor'), edges, dateOf)
    expect(out.map((n) => [n.cardId, n.depth])).toEqual([
      [id('anchor'), 0],
      [id('far'), 1],
      [id('near'), 1],
    ])
  })

  it('环安全：相连成环也照走不漏不圈，每珠只出一份', () => {
    const edges = [edge(id('a'), id('b'), 1), edge(id('b'), id('c'), 2), edge(id('c'), id('a'), 3)]
    const out = threadOrder(id('a'), edges, dateOf)
    expect(out).toHaveLength(3)
    expect(out.map((n) => n.cardId)).toEqual([id('a'), id('b'), id('c')])
  })

  it('连通分量：不相连的岛不入串', () => {
    const edges = [edge(id('a'), id('b'), 1), edge(id('x'), id('y'), 2)]
    const out = threadOrder(id('a'), edges, dateOf)
    expect(out.map((n) => n.cardId)).toEqual([id('a'), id('b')])
  })

  it('裸纸：没牵过线的锚点自己就是一串（独苗一颗珠）', () => {
    expect(threadOrder(id('solo'), [], dateOf)).toEqual([{ cardId: id('solo'), depth: 0 }])
  })
})
