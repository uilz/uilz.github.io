import type { Card, CardId } from './types'
import { isHex64 } from './validate'

// GC 可达性计算：导出只收录“被引用”的资产。规则刻意简单（见 collectCardHashRefs），
// 宁可多收录也不能漏收录——漏掉引用会让用户资产在归档里消失。

/**
 * 从一张卡的 props 里收集资产 hash 引用：泛型遍历 props 对象树，
 * 凡 key 为 'hash' 且值是 64 位小写十六进制字符串者计为引用。
 * 这样未知 kind（原样保留的卡片）里的 hash 引用同样被追踪。
 */
export function collectCardHashRefs(props: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(props)) {
    for (const item of props) collectCardHashRefs(item, out)
    return out
  }
  if (typeof props !== 'object' || props === null) return out
  const rec = props as Record<string, unknown> // 已判定为对象，仅做索引访问视图
  for (const key of Object.keys(rec)) {
    const value = rec[key]
    if (key === 'hash' && isHex64(value)) out.add(value)
    else collectCardHashRefs(value, out)
  }
  return out
}

/** 从卡片集合收集全部可达资产 hash（含容器子树内的卡片）。 */
export function collectReachableHashes(cards: Iterable<Card>): Set<string> {
  const hashes = new Set<string>()
  for (const card of cards) collectCardHashRefs(card.props, hashes)
  return hashes
}

/**
 * 返回 root 及其全部后代 id（含 root 自身）；环形 children 引用被安全忽略（去重访问）。
 * 依赖映射由调用方构造（单文档内用 byId，级联删除用同样方式）。
 */
export function collectSubtreeIds(cardsById: ReadonlyMap<CardId, Card>, root: CardId): Set<CardId> {
  const collected = new Set<CardId>()
  const stack: CardId[] = [root]
  while (stack.length > 0) {
    const id = stack.pop()
    if (id === undefined || collected.has(id)) continue
    collected.add(id)
    const card = cardsById.get(id)
    if (card?.children !== undefined) {
      for (const child of card.children) {
        if (!collected.has(child)) stack.push(child)
      }
    }
  }
  return collected
}

/** 从文档卡片集合构造 id→card 映射。 */
export function cardsByIdOf(cards: readonly Card[]): Map<CardId, Card> {
  return new Map(cards.map((c) => [c.id, c]))
}
