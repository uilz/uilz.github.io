// 「撕下 → 再想想」的纯簿记：删除前把级联集与幸存父卡的 children 悬空引用拍成逐字快照。
// restore 过界走 app.restoreCards（唯一数据门）；此模块零存储、零时序，纯函数可测。
import type { Card, CardId } from '../domain/types'
import type { DeleteSnapshot, ParentPatch } from '../application'

export interface UndoCapture {
  readonly doomed: readonly CardId[]
  readonly snapshot: DeleteSnapshot
}

/** 级联删除前捕获：cards 逐字（含 props/children/pos/size/z/meta/时间戳），parentPatches 记幸存引用原位。 */
export function buildDeleteSnapshot(cards: readonly Card[], doomed: ReadonlySet<CardId>): UndoCapture {
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
  return { doomed: [...doomed], snapshot: { cards: doomedCards, parentPatches } }
}
