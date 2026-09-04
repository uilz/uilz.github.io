// 手势 → 纸面新世界的翻译官（纯计划层）：中介拿到 plan 后只做 diff/落笔/回执，判别全在这里。
// D3 拖入、D4 拖出、D5 平移与扩边角：每一式都是 cards → cards' 的纯函数，违例在闸前被拒。
import type { Card, CardId, CardPos, CardSize } from '../domain/types'
import { clampCardPos } from './placement'
import {
  canNest,
  detach,
  fitStacks,
  matFitOf,
  reattach,
  stackIssues,
  subtreeTranslate,
} from './stackGeometry'

export type StackReject = 'gone' | 'nested-illegal'

export type StackPlan = { readonly ok: true; readonly cards: readonly Card[] } | { readonly ok: false; readonly reason: StackReject }

function locate(cards: readonly Card[], id: CardId): Card | undefined {
  return cards.find((c) => c.id === id)
}

/** 落点平移：纸身到 to（画布绝对、钳进纸内），若它是带纸的垫纸，整棵树跟着挪（契约决策 R1）。 */
function translateTo(cards: readonly Card[], id: CardId, to: CardPos): readonly Card[] {
  const card = locate(cards, id)
  if (card === undefined) return cards
  const next = clampCardPos(to)
  return subtreeTranslate(cards, id, next.x - card.pos.x, next.y - card.pos.y)
}

/** D3 拖入：落点就位 → 收编（旧叠自动让渡）→ 全叠扩边 → 拓扑闸。childPos 是释放点，同拍传进来免读陈旧态。 */
export function planAttach(cards: readonly Card[], parentId: CardId, childId: CardId, childPos: CardPos): StackPlan {
  if (locate(cards, childId) === undefined || !canNest(cards, parentId, childId)) {
    return { ok: false, reason: locate(cards, childId) === undefined ? 'gone' : 'nested-illegal' }
  }
  const moved = translateTo(cards, childId, childPos)
  const next = fitStacks(reattach(moved, parentId, childId))
  if (stackIssues(next).length > 0) return { ok: false, reason: 'nested-illegal' }
  return { ok: true, cards: next }
}

/** D4 拖出：落点就位 → 从认领的叠里抽出 → 旧叠扩边（只扩不缩是 D5 的诚实）。 */
export function planDetach(cards: readonly Card[], childId: CardId, pos: CardPos): StackPlan {
  if (locate(cards, childId) === undefined) return { ok: false, reason: 'gone' }
  const moved = translateTo(cards, childId, pos)
  const next = fitStacks(detach(moved, childId))
  if (stackIssues(next).length > 0) return { ok: false, reason: 'nested-illegal' }
  return { ok: true, cards: next }
}

/** 普通落笔：位置经 D5 的子树平移与全叠扩边——move 是唯一入口，手势与别处共用一条路。 */
export function planMove(cards: readonly Card[], id: CardId, pos: CardPos): StackPlan {
  if (locate(cards, id) === undefined) return { ok: false, reason: 'gone' }
  const next = fitStacks(translateTo(cards, id, pos))
  return { ok: true, cards: next }
}

/** D5 手工 resize：容器被钳到 [fit, +∞)（缩不穿自己的纸，可无上限放大）；普通卡原样。 */
export function planResize(cards: readonly Card[], id: CardId, size: CardSize): StackPlan {
  const card = locate(cards, id)
  if (card === undefined) return { ok: false, reason: 'gone' }
  if (card.kind !== 'container') {
    return { ok: true, cards: cards.map((c) => (c.id === id ? { ...c, size } : c)) }
  }
  const fit = matFitOf(cards, id)
  if (fit === null) return { ok: false, reason: 'gone' }
  // fitContainerBounds 传期望值即完成“向上钳制”：低于纸 + 呼吸者回到地板，高于者保留。
  const desired = { pos: card.pos, size: { w: Math.max(size.w, fit.size.w), h: Math.max(size.h, fit.size.h) } }
  const next = fitStacks(cards.map((c) => (c.id === id ? { ...c, ...desired } : c)))
  return { ok: true, cards: next }
}

/** 待落笔的字段差分：只有真正变了的卡才进串行链（pos/size 走 move/resize，children 走 update 补丁）。 */
export interface IntentDelta {
  readonly id: CardId
  readonly pos?: CardPos
  readonly size?: CardSize
  readonly children?: CardId[]
}

export function diffIntents(prev: readonly Card[], next: readonly Card[]): readonly IntentDelta[] {
  const prevById = new Map(prev.map((c) => [c.id, c]))
  const out: IntentDelta[] = []
  for (const c of next) {
    const old = prevById.get(c.id)
    if (old === undefined) continue
    const d: { id: CardId; pos?: CardPos; size?: CardSize; children?: CardId[] } = { id: c.id }
    if (c.pos !== old.pos) d.pos = c.pos
    if (c.size !== old.size) d.size = c.size
    if (c.children !== old.children) d.children = c.children === undefined ? [] : [...c.children]
    if (d.pos !== undefined || d.size !== undefined || d.children !== undefined) out.push(d)
  }
  return out
}

/** 拓扑闸拦下时的便签：违例几乎只来自陈旧的双开标签页，静默丢弃 + 一句人话，绝不谎称已入叠。 */
export const ATTACH_REJECTED_COPY = '这张纸没能放进去 · 别让叠套进自己的怀里'
export const DETACH_REJECTED_COPY = '这张纸没能抽出来 · 再试一次'
