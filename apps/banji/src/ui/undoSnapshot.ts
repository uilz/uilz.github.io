// 「撕下 → 再想想」的纯簿记：删除前把级联集、幸存父卡的 children 悬空引用、牵连子树的边拍成逐字快照。
// restore 过界走 app.restoreCards（唯一数据门）；此模块零存储、零时序，纯函数可测。
import type { Card, CardId, EdgeRecord } from '../domain/types'
import { edgesTouching } from '../domain/edges'
import type { DeleteSnapshot, ParentPatch } from '../application'

export interface UndoCapture {
  readonly doomed: readonly CardId[]
  readonly snapshot: DeleteSnapshot
}

/**
 * 级联删除前捕获：cards 逐字（含 props/children/pos/size/z/meta/时间戳），parentPatches 记幸存引用原位；
 * D4 起 links（当前 UI 持有的全量边）中触及 doomed 的边逐字进 edgePatches——
 * parentPatches 管「卡内席位」、edgePatches 管「线的两端」，删一张既在叠里又牵着线的纸时两样都盖住。
 */
export function buildDeleteSnapshot(
  cards: readonly Card[],
  doomed: ReadonlySet<CardId>,
  links: readonly EdgeRecord[] = [],
): UndoCapture {
  const doomedCards = cards.filter((c) => doomed.has(c.id)).map((c) => structuredClone(c))
  const parentPatches: ParentPatch[] = []
  for (const survivor of cards) {
    if (doomed.has(survivor.id) || survivor.children === undefined) continue
    const childIds = survivor.children
    for (let i = 0; i < childIds.length; i++) {
      const childId = childIds[i]
      if (childId !== undefined && doomed.has(childId)) parentPatches.push({ parentId: survivor.id, childId, index: i })
    }
  }
  const edgePatches = edgesTouching(links, doomed).map((e) => structuredClone(e))
  return { doomed: [...doomed], snapshot: { cards: doomedCards, parentPatches, edgePatches } }
}

/** prune-at-delete-commit：幸存者 children 里的 doomed 引用同批滤净（悬空引用活不过一次提交）。 */
export function stripDoomedRefs(cards: readonly Card[], doomed: ReadonlySet<CardId>): readonly Card[] {
  return cards.map((c) =>
    c.children === undefined || !c.children.some((id) => doomed.has(id))
      ? c
      : { ...c, children: c.children.filter((id) => !doomed.has(id)) },
  )
}
