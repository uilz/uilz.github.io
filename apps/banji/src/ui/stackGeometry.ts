// 「拖入卡内」的几何学 —— 纯函数，零 React、零存储（placement.ts 同风）。
// 判定归判定、落笔归中介：这里只回答「指针压着哪张垫纸、垫纸该铺多大、拖走谁跟着走」。
// 不变量复用 domain（children 单父/无环由 cardShape.containerIssues 把门，这里不另起炉灶）。
import type { Card, CardId, CardPos, CardSize } from '../domain/types'
import { cardsByIdOf, collectSubtreeIds } from '../domain/gc'
import { containerIssues, type TopoNode, type ValidationIssue } from '../domain/validate'

/** 垫纸呼吸：子纸四周必须留在垫纸内 ≥24px（D5）。 */
export const MAT_PAD = 24
/** 空叠的地板：再空的垫纸也得配得上一张纸（D5 MIN）。 */
export const MAT_MIN: CardSize = { w: 220, h: 160 }

/** 只关心 pos/size 的结构子类型：卡片与测试夹具都能直接进来。 */
export interface Bounded {
  readonly pos: CardPos
  readonly size: CardSize
}

export interface MatRect {
  readonly pos: CardPos
  readonly size: CardSize
}

/** 认领索引：只有 kind==='container' 的 children 算认领（与 containerIssues 同一口径），重复认领取第一个。 */
export function parentIndex(cards: readonly Card[]): Map<CardId, CardId> {
  const map = new Map<CardId, CardId>()
  for (const c of cards) {
    if (c.kind !== 'container' || c.children === undefined) continue
    for (const child of c.children) {
      if (!map.has(child)) map.set(child, c.id)
    }
  }
  return map
}

/** root 及其全部后代（含 root）。环形数据由 domain 的可达性遍历安全兜住。 */
export function subtreeIds(cards: readonly Card[], rootId: CardId): Set<CardId> {
  return collectSubtreeIds(cardsByIdOf(cards), rootId)
}

/** ancestor 的全部祖先链（root 在前），visited 截环。 */
function ancestorChain(parents: ReadonlyMap<CardId, CardId>, startId: CardId): CardId[] {
  const chain: CardId[] = []
  const visited = new Set<CardId>([startId])
  let cur = parents.get(startId)
  while (cur !== undefined && !visited.has(cur)) {
    chain.unshift(cur)
    visited.add(cur)
    cur = parents.get(cur)
  }
  return chain
}

/** 某卡的直接认领者（只有 container 认领算数）。 */
export function parentIdOf(cards: readonly Card[], childId: CardId): CardId | null {
  return parentIndex(cards).get(childId) ?? null
}

/** D3/D4 判定的前提：parent 是存在的容器、child 存在、不自抱、不套进自己的怀里（环）。 */
export function canNest(cards: readonly Card[], parentId: CardId, childId: CardId): boolean {
  if (parentId === childId) return false
  const parent = cards.find((c) => c.id === parentId)
  if (parent === undefined || parent.kind !== 'container') return false
  if (!cards.some((c) => c.id === childId)) return false
  return !subtreeIds(cards, childId).has(parentId)
}

function contains(rect: MatRect, p: CardPos): boolean {
  return p.x >= rect.pos.x && p.x <= rect.pos.x + rect.size.w && p.y >= rect.pos.y && p.y <= rect.pos.y + rect.size.h
}

/**
 * 压在指针下的垫纸（D3）：视觉最上面者优先——按 renderStackOrder 派生渲染序判“上”，
 * 不按存储 z（D2 的垫纸恒below子纸使两个序本就不同）。拖拽卡自身与它的子孙不作目标（环护栏）。
 */
export function hitTestContainer(pointer: CardPos, cards: readonly Card[], draggedId: CardId): CardId | null {
  const forbidden = subtreeIds(cards, draggedId)
  let top: CardId | null = null
  for (const c of renderStackOrder(cards)) {
    if (c.kind === 'container' && !forbidden.has(c.id) && contains(c, pointer)) top = c.id
  }
  return top
}

/**
 * 垫纸的拟合（D5）：把全部子纸 + 24px 呼吸收进垫纸的最小纸面，地板 220×160。
 * **只扩不缩**——与 current（现垫纸或手工 resize 的期望值）取并集：
 * 自动路径（attach/detach/child-move）传现值 = 绝不吞掉用户手工扩出的边；
 * 手工缩小时传期望值 = 低于子纸 + 呼吸的部分被钳回地板。
 */
export function fitContainerBounds(children: readonly Bounded[], current: Bounded): MatRect {
  let left = current.pos.x
  let top = current.pos.y
  let right = current.pos.x + current.size.w
  let bottom = current.pos.y + current.size.h
  for (const c of children) {
    left = Math.min(left, c.pos.x - MAT_PAD)
    top = Math.min(top, c.pos.y - MAT_PAD)
    right = Math.max(right, c.pos.x + c.size.w + MAT_PAD)
    bottom = Math.max(bottom, c.pos.y + c.size.h + MAT_PAD)
  }
  if (left < 0) left = 0
  if (top < 0) top = 0
  return {
    pos: { x: left, y: top },
    size: {
      w: Math.max(right - left, MAT_MIN.w),
      h: Math.max(bottom - top, MAT_MIN.h),
    },
  }
}

/** 某垫纸按其当前子纸算出的目标纸面（不存在或非容器返回 null）。 */
export function matFitOf(cards: readonly Card[], matId: CardId): MatRect | null {
  const mat = cards.find((c) => c.id === matId)
  if (mat === undefined || mat.kind !== 'container') return null
  const byId = cardsByIdOf(cards)
  const children = (mat.children ?? []).map((id) => byId.get(id)).filter((c): c is Card => c !== undefined)
  return fitContainerBounds(children, mat)
}

/** 一轮全量扩边：每张垫纸都按现有子纸过一遍 fit（幂等）。 */
function refitPass(cards: readonly Card[]): { readonly next: readonly Card[]; readonly changed: boolean } {
  let changed = false
  const next = cards.map((c) => {
    if (c.kind !== 'container') return c
    const fit = matFitOf(cards, c.id)
    if (fit === null) return c
    if (fit.pos.x === c.pos.x && fit.pos.y === c.pos.y && fit.size.w === c.size.w && fit.size.h === c.size.h) return c
    changed = true
    return { ...c, pos: fit.pos, size: fit.size }
  })
  return { next, changed }
}

/**
 * 结构变更（attach/detach/child-move/container-resize）后重排所有叠的边（D5）。
 * 叠中叠要级联：反复扩到不动点。合法（无环）数据每轮至少定格一张垫纸、≤层深轮收敛；
 * 环形病态数据永不收敛——到达轮数上限即原样返回（扩边只是修饰，绝不让坏数据的无限膨胀落库）。
 */
export function fitStacks(cards: readonly Card[]): readonly Card[] {
  let current = cards
  for (let round = 0; round <= cards.length; round++) {
    const pass = refitPass(current)
    if (!pass.changed) return pass.next
    current = pass.next
  }
  return cards
}

/** 容器被拖 = 整树同 delta（R1 契约决策：children 永远是画布绝对坐标，平移子树不改坐标系）。 */
export function subtreeTranslate(cards: readonly Card[], rootId: CardId, dx: number, dy: number): readonly Card[] {
  if (dx === 0 && dy === 0) return cards
  const set = subtreeIds(cards, rootId)
  return cards.map((c) => {
    if (!set.has(c.id)) return c
    return {
      ...c,
      pos: { x: Math.max(0, c.pos.x + dx), y: Math.max(0, c.pos.y + dy) },
    }
  })
}

/** 把 childId 收编到 parentId 末尾；已认领则原样返回（幂等，不产生空引用的写意图）。 */
export function reattach(cards: readonly Card[], parentId: CardId, childId: CardId): readonly Card[] {
  if (cards.some((c) => c.id === parentId && c.children?.includes(childId) === true)) return cards
  return cards.map((c) => {
    if (c.id === parentId) return { ...c, children: [...(c.children ?? []), childId] }
    if (c.children?.includes(childId) === true) return { ...c, children: c.children.filter((id) => id !== childId) }
    return c
  })
}

/** 从认领它的叠里抽出（D4）；子纸跟着纸身走，不拆散它自己的叠。 */
export function detach(cards: readonly Card[], childId: CardId): readonly Card[] {
  return cards.map((c) => (c.children?.includes(childId) === true ? { ...c, children: c.children.filter((id) => id !== childId) } : c))
}

/** 写意图前的拓扑闸（复用 domain 校验器）：单父/无环违例 = 意图死在闸前，不落笔。 */
export function stackIssues(cards: readonly Card[]): readonly ValidationIssue[] {
  const topo: TopoNode[] = cards.map((c) => (c.children === undefined ? { id: c.id, kind: c.kind } : { id: c.id, kind: c.kind, children: c.children }))
  return containerIssues(topo, 'ui.cards')
}

/** z 升序的拷贝：置顶抬位与新生落位共用的同一把尺。 */
export function sortByZ(cards: readonly Card[]): readonly Card[] {
  return [...cards].sort((a, b) => (a.z ?? 0) - (b.z ?? 0))
}

/**
 * 渲染序（D2）：z 升序为底，但垫纸永远垫在自己的纸下面 —— 不管存储 z 怎么写。
 * 只在渲染层推导，存储的 z 一个字都不改；叠中叠沿祖先链逐层前置。
 */
export function renderStackOrder(cards: readonly Card[]): readonly Card[] {
  const byId = cardsByIdOf(cards)
  const parents = parentIndex(cards)
  const byZ = sortByZ(cards)
  const out: Card[] = []
  const placed = new Set<CardId>()
  const place = (id: CardId): void => {
    if (placed.has(id)) return
    const card = byId.get(id)
    if (card !== undefined) {
      placed.add(id)
      out.push(card)
    }
  }
  for (const c of byZ) {
    for (const ancId of ancestorChain(parents, c.id)) place(ancId)
    place(c.id)
  }
  return out
}
