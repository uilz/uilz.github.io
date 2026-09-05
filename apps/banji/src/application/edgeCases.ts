// 关系缝 + 删除/恢复的边端编排（R7）。D4 铁律：deleteCardCascade 与级联剪边在同一用例
// 调用里提交——「库中永不存谎言档案」的 R5 前例延伸到边；restoreCards 凭
// snapshot.edgePatches 逐字重插，幂等如 children。依赖注入 repo，零 React/DOM，排链归 UI 中介。
import type { Card, CardId, EdgeRecord, JournalDoc } from '../domain/types'
import { cardsByIdOf, collectCardHashRefs, collectSubtreeIds } from '../domain/gc'
import { edgesTouching } from '../domain/edges'
import { newEdgeId } from '../domain/id'
import { addDays } from '../domain/date'
import { validateJournalDoc } from '../domain/validate'
import type { Repo } from '../repository/types'
import { CardNotFoundError, JournalNotFoundError, InvalidRestoreError, requireDate } from './types'
import type { CardAt, DeleteSnapshot, RecentCard } from './types'

/**
 * 撕下（D4）：级联删整棵子树 + 同批剪掉触及子树的全部边（by_source/by_target 双向查询，
 * 跨日边也剪）。返回被剪边逐字副本（undo 快照的原料）。
 */
export async function deleteCardCascade(repo: Repo, stamp: () => string, date: string, id: CardId): Promise<EdgeRecord[]> {
  const doc = await repo.journals.get(date)
  if (doc === undefined) throw new JournalNotFoundError(date)
  const byId = cardsByIdOf(doc.cards)
  if (!byId.has(id)) throw new CardNotFoundError(date, id)
  const doomed = collectSubtreeIds(byId, id)
  await repo.journals.put({ ...doc, cards: doc.cards.filter((c) => !doomed.has(c.id)), updatedAt: stamp() })
  const touched = new Map<string, EdgeRecord>()
  for (const cardId of doomed) {
    for (const e of [...(await repo.edges.bySource(cardId)), ...(await repo.edges.byTarget(cardId))]) touched.set(e.id, e)
  }
  const doomedEdges = edgesTouching([...touched.values()], doomed)
  for (const edge of doomedEdges) await repo.edges.remove(edge.id)
  return doomedEdges.map((e) => structuredClone(e))
}

/** edgePatches 逐字重插：库里已有同 id 者跳过（双次幂等），时间戳一件不重生。 */
export async function restoreEdges(repo: Repo, snapshot: DeleteSnapshot): Promise<void> {
  for (const edge of snapshot.edgePatches ?? []) {
    if ((await repo.edges.get(edge.id)) === undefined) await repo.edges.put(structuredClone(edge))
  }
}

/** 再想想：卡片逐字回位 + parentPatches 按出生席位重插 + edgePatches 重接；只前进文档 updatedAt。 */
export async function restoreCards(repo: Repo, stamp: () => string, date: string, snapshot: DeleteSnapshot): Promise<void> {
  requireDate(date)
  const doc = await repo.journals.get(date)
  let cards: Card[] = doc === undefined ? [] : [...doc.cards]
  for (const card of structuredClone(snapshot.cards)) {
    if (cards.some((c) => c.id === card.id)) continue
    cards.push(card)
  }
  for (const patch of snapshot.parentPatches) {
    const parentExists = cards.some((c) => c.id === patch.parentId)
    if (!parentExists) continue
    cards = cards.map((c) => {
      if (c.id !== patch.parentId) return c
      const children = c.children ?? []
      if (children.includes(patch.childId)) return c
      const next = [...children]
      next.splice(Math.max(0, Math.min(next.length, Math.trunc(patch.index))), 0, patch.childId)
      return { ...c, children: next }
    })
  }
  const restored: JournalDoc = { date, cards, updatedAt: stamp() }
  const v = validateJournalDoc(restored)
  if (!v.ok) throw new InvalidRestoreError(date, v.issues)
  await repo.journals.put(restored)
  await restoreEdges(repo, snapshot)
}

const liveCardIds = async (repo: Repo): Promise<Set<string>> => {
  const ids = new Set<string>()
  for (const d of await repo.journals.list()) for (const c of d.cards) ids.add(c.id)
  return ids
}

/**
 * 牵线（D1）：三道静默闸——自牵、端点无卡（全库扫描，删过的纸不配拥有线）、
 * 同对卡任一方向已有线（role 休眠期一根就够）。过闸才落笔，时间戳同一枚。
 */
export async function addEdge(repo: Repo, stamp: () => string, source: CardId, target: CardId): Promise<EdgeRecord | null> {
  if (source === target) return null
  const live = await liveCardIds(repo)
  if (!live.has(source) || !live.has(target)) return null
  const forward = await repo.edges.bySource(source)
  if (forward.some((e) => e.target === target)) return null
  const backward = await repo.edges.byTarget(source)
  if (backward.some((e) => e.source === target)) return null
  const ts = stamp()
  const edge: EdgeRecord = { id: newEdgeId(), source, target, createdAt: ts, updatedAt: ts }
  await repo.edges.put(edge)
  return edge
}

export async function listEdgesForCards(repo: Repo, ids: readonly CardId[]): Promise<EdgeRecord[]> {
  const found = new Map<string, EdgeRecord>()
  for (const id of ids) {
    for (const e of [...(await repo.edges.bySource(id)), ...(await repo.edges.byTarget(id))]) found.set(e.id, e)
  }
  return [...found.values()].sort((a, b) => (a.id < b.id ? -1 : 1))
}

/** 「牵给近日」候选窗（D1）：[anchor−days, anchor)——anchor 前恰 days 个整天（当日不在窗内，近日上限含端点）。 */
export async function getRecentCards(repo: Repo, anchor: string, days: number): Promise<RecentCard[]> {
  requireDate(anchor)
  const floor = addDays(anchor, -days)
  const out: RecentCard[] = []
  for (const d of await repo.journals.list()) {
    if (d.date < floor || d.date >= anchor) continue
    for (const card of d.cards) {
      if (card.kind === 'container') continue
      const hash = [...collectCardHashRefs(card.props)][0]
      const name = hash === undefined ? undefined : (await repo.assets.get(hash))?.name
      out.push({ date: d.date, card, ...(name === undefined ? {} : { assetName: name }) })
    }
  }
  return out.sort((a, b) => (a.date === b.date ? (a.card.createdAt < b.card.createdAt ? -1 : 1) : a.date < b.date ? 1 : -1))
}

export async function loadAllCards(repo: Repo): Promise<CardAt[]> {
  return (await repo.journals.list())
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .flatMap((d) => d.cards.map((card) => ({ date: d.date, card })))
}

export const loadAllEdges = (repo: Repo): Promise<EdgeRecord[]> => repo.edges.list()

export const deleteEdge = (repo: Repo, id: string): Promise<void> => repo.edges.remove(id)
