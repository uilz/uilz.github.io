// 牵线的手势几何与线的画法 —— 纯函数：谁能被牵（D1 靶子判定）、铅笔淡痕怎么弯（D2 几何）。
// 判定复用 stackGeometry（父子链与子树）与 domain/edges（配对键）——UI 不自造第二套口径。
import type { Card, CardId, EdgeRecord } from '../domain/types'
import { pairKey, threadOrder } from '../domain/edges'
import { parentIndex, subtreeIds } from './stackGeometry'

export type LinkPhase = 'origin' | 'target' | 'blocked'

/**
 * 每张纸在牵线模式里的处境：起点=origin；自己的祖先/后代（整棵子树+父链）=blocked——
 * 同坐一张纸的家人不算客，不外牵；已连过的对（任一方向）=blocked——一根线就够。
 */
export function linkPhases(cards: readonly Card[], links: readonly EdgeRecord[], origin: CardId | null): Map<CardId, LinkPhase> {
  const out = new Map<CardId, LinkPhase>()
  if (origin === null) return out
  const blocked = subtreeIds(cards, origin)
  const parents = parentIndex(cards)
  let p = parents.get(origin)
  while (p !== undefined) {
    blocked.add(p)
    p = parents.get(p)
  }
  const paired = new Set(links.map((e) => pairKey(e.source, e.target)))
  for (const c of cards) {
    out.set(
      c.id,
      c.id === origin ? 'origin' : blocked.has(c.id) || paired.has(pairKey(origin, c.id)) ? 'blocked' : 'target',
    )
  }
  return out
}

/** 画布上的点（卡片坐标系）。 */
export interface Pt {
  readonly x: number
  readonly y: number
}

export interface LineShape {
  /** 二次贝塞尔：M 起点 Q 控制 终点。 */
  readonly d: string
  /** 曲线 t=0.5 处（撕线签的落座点）。 */
  readonly mid: Pt
}

export function centerOf(card: Card): Pt {
  return { x: card.pos.x + card.size.w / 2, y: card.pos.y + card.size.h / 2 }
}

/** 串珠子的一层：同链距者并排（序已按日期定好）。 */
export interface ThreadRun {
  readonly depth: number
  readonly beads: readonly { cardId: CardId; date: string }[]
}

/**
 * threadOrder 的分层视图（D5「一串珠子」）：按链距离分层、层内按日期；
 * 端点无卡的病态边逐珠跳过（线不认幽灵）。日期分组交给渲染层做墨印分隔。
 */
export function threadRuns(start: CardId, edges: readonly EdgeRecord[], lookup: (id: CardId) => { date: string } | undefined): ThreadRun[] {
  const nodes = threadOrder(start, edges, (id) => lookup(id)?.date ?? '9999-12-31')
  const runs: { depth: number; beads: { cardId: CardId; date: string }[] }[] = []
  for (const n of nodes) {
    const at = lookup(n.cardId)
    if (at === undefined) continue
    const top = runs[runs.length - 1]
    if (top !== undefined && top.depth === n.depth) top.beads.push({ cardId: n.cardId, date: at.date })
    else runs.push({ depth: n.depth, beads: [{ cardId: n.cardId, date: at.date }] })
  }
  return runs
}

/**
 * 铅笔淡痕的几何：控制点垂直于连线、偏移 8% 长度；弯曲方向由两端 id 比较定号——
 * 同一根线永远朝同一侧弯（确定性，刷新不跳相）。零长（两纸共心）由调用方按「不画」处理。
 */
export function lineShape(a: Pt, b: Pt, sourceId: string, targetId: string): LineShape | null {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len < 1) return null
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2
  const sign = sourceId < targetId ? 1 : -1
  const off = len * 0.08 * sign
  const cx = mx + (-dy / len) * off
  const cy = my + (dx / len) * off
  return {
    d: `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`,
    mid: { x: 0.25 * a.x + 0.5 * cx + 0.25 * b.x, y: 0.25 * a.y + 0.5 * cy + 0.25 * b.y },
  }
}
