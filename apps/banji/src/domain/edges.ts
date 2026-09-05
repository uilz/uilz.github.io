// 关系系统的纯函数面 —— 配对键、级联选边、BFS 串线。零 I/O（gc.ts 同风）。
// 边是铅笔淡痕：这里只回答「同一根线了吗、这根线牵连谁、一串珠子怎么排」。
import type { CardId, EdgeRecord } from './types'

/**
 * 无序配对键：同一对卡的正反两根线折叠到同一个键上。
 * role 休眠期「一根线就够」的判定口径 —— dedup 闸与可牵靶子共用。
 */
export function pairKey(a: CardId, b: CardId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/** 触及给定卡片集合的边（source 或 target 落在 ids 里）——删卡剪边与快照的选择器。 */
export function edgesTouching(edges: readonly EdgeRecord[], ids: ReadonlySet<CardId>): EdgeRecord[] {
  return edges.filter((e) => ids.has(e.source) || ids.has(e.target))
}

/** 串线上的一个珠位：卡片与被牵出的链距离（锚点为 0）。 */
export interface ThreadNode {
  readonly cardId: CardId
  readonly depth: number
}

/**
 * BFS 连通分量（边按无向图走），产出自然阅读序：链距离升序、平级按日期升序
 * （同一天再按 id 定序，确定性无平局）。「牵给近日」跨日珠子靠 dateOf 归位。
 * 环安全：visited 闸进 —— 甲牵乙、乙牵甲、甚至自绘的连环，都永不圈住不走。
 */
export function threadOrder(start: CardId, edges: readonly EdgeRecord[], dateOf: (id: CardId) => string): ThreadNode[] {
  const adj = new Map<CardId, CardId[]>()
  const link = (a: CardId, b: CardId): void => {
    const list = adj.get(a)
    if (list === undefined) adj.set(a, [b])
    else list.push(b)
  }
  for (const e of edges) {
    link(e.source, e.target)
    link(e.target, e.source)
  }
  const seen = new Set<CardId>([start])
  const out: ThreadNode[] = [{ cardId: start, depth: 0 }]
  let frontier: CardId[] = [start]
  let depth = 0
  while (frontier.length > 0) {
    depth += 1
    const next: CardId[] = []
    for (const id of frontier) {
      for (const nb of adj.get(id) ?? []) {
        if (seen.has(nb)) continue
        seen.add(nb)
        next.push(nb)
      }
    }
    next.sort((a, b) => {
      const da = dateOf(a)
      const db = dateOf(b)
      if (da !== db) return da < db ? -1 : 1
      return a < b ? -1 : 1
    })
    for (const id of next) out.push({ cardId: id, depth })
    frontier = next
  }
  return out
}
