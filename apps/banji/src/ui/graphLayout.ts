// 图模式（R8·D3）的布局内核：时间轴上的纸串，不是物理网。纯函数、确定性——
// x=日期列（历法升序），y=日内堆叠（createdAt 升序），容器的孩子作为独立 chip 缩进悬于母 chip 之下；
// 边=两端 chip 都存在的发丝贝塞尔（画法复用 linkage.lineShape，同一根线刷新不跳相）。
// 无 zoom、无拖拽重排、无 animation loop——opts 全部有纸感默认值。
import type { CardId, EdgeRecord } from '../domain/types'
import type { IconKind } from './cards/types'
import { lineShape, type Pt } from './linkage'

export interface GraphEntry {
  readonly cardId: CardId
  readonly date: string
  readonly createdAt: string
  readonly snippet: string
  readonly icon: IconKind
  readonly children: readonly CardId[]
}

export interface GraphOpts {
  readonly colWidth?: number
  readonly chipHeight?: number
  readonly gutter?: number
  readonly gapY?: number
  readonly labelHeight?: number
  readonly indentPx?: number
  readonly maxIndent?: number
  readonly pad?: number
}

export interface GraphChip {
  readonly entry: GraphEntry
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly depth: number
}

export interface GraphColumn {
  readonly date: string
  readonly x: number
  readonly width: number
}

export interface GraphLine {
  readonly id: string
  readonly from: CardId
  readonly to: CardId
  readonly d: string
}

export interface GraphLayout {
  readonly columns: readonly GraphColumn[]
  readonly chips: readonly GraphChip[]
  readonly lines: readonly GraphLine[]
  readonly width: number
  readonly height: number
}

const DEFAULTS: Required<GraphOpts> = {
  colWidth: 176,
  chipHeight: 34,
  gutter: 12,
  gapY: 10,
  labelHeight: 34,
  indentPx: 14,
  maxIndent: 3,
  pad: 20,
}

interface Slot {
  readonly entry: GraphEntry
  readonly depth: number
}

function dayColumn(entries: readonly GraphEntry[], byId: Map<CardId, GraphEntry>, maxIndent: number): Slot[] {
  const out: Slot[] = []
  const placed = new Set<CardId>()
  const childrenOfSameDay = new Set<CardId>(
    entries.flatMap((e) => e.children.filter((id) => byId.get(id)?.date === e.date)),
  )
  const descend = (entry: GraphEntry, depth: number): void => {
    placed.add(entry.cardId)
    out.push({ entry, depth })
    if (entry.children.length === 0 || depth >= maxIndent) return
    for (const childId of entry.children) {
      const child = byId.get(childId)
      if (child === undefined || placed.has(child.cardId) || child.date !== entry.date) continue
      descend(child, depth + 1)
    }
  }
  for (const e of entries) {
    if (placed.has(e.cardId) || childrenOfSameDay.has(e.cardId)) continue
    descend(e, 0)
  }
  // 病态环（互为父子）兜底：漏网的纸仍按 createdAt 序上柱，图不吞纸。
  for (const e of entries) {
    if (placed.has(e.cardId)) continue
    descend(e, 0)
  }
  return out
}

/** 布局一个纸串：输入顺序不参与几何（日内按 createdAt 升序、并列按 id 定序），同输入恒同输出。 */
export function graphLayout(entries: readonly GraphEntry[], edges: readonly EdgeRecord[], opts: GraphOpts = {}): GraphLayout {
  const o = { ...DEFAULTS, ...opts }
  const dates = [...new Set(entries.map((e) => e.date))].sort()
  const byId = new Map(entries.map((e): [CardId, GraphEntry] => [e.cardId, e]))
  const columns: GraphColumn[] = []
  const chips: GraphChip[] = []
  let tallest = o.labelHeight + o.chipHeight
  dates.forEach((date, ci) => {
    const colX = o.pad + ci * o.colWidth
    columns.push({ date, x: colX, width: o.colWidth })
    const day = entries
      .filter((e) => e.date === date)
      .sort((a, b) => (a.createdAt === b.createdAt ? (a.cardId < b.cardId ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1))
    dayColumn(day, byId, o.maxIndent).forEach((slot, si) => {
      const w = o.colWidth - 2 * o.gutter - slot.depth * o.indentPx
      chips.push({
        entry: slot.entry,
        x: colX + o.gutter + slot.depth * o.indentPx,
        y: o.labelHeight + si * (o.chipHeight + o.gapY),
        w,
        h: o.chipHeight,
        depth: slot.depth,
      })
    })
    const dayH = o.labelHeight + day.length * (o.chipHeight + o.gapY)
    if (dayH > tallest) tallest = dayH
  })
  const slotById = new Map(chips.map((c): [CardId, GraphChip] => [c.entry.cardId, c]))
  const lines: GraphLine[] = []
  const center = (chip: GraphChip): Pt => ({ x: chip.x + chip.w / 2, y: chip.y + chip.h / 2 })
  for (const e of edges) {
    const a = slotById.get(e.source)
    const b = slotById.get(e.target)
    if (a === undefined || b === undefined) continue
    const shape = lineShape(center(a), center(b), e.source, e.target)
    if (shape === null) continue
    lines.push({ id: e.id, from: e.source, to: e.target, d: shape.d })
  }
  return {
    columns,
    chips,
    lines,
    width: dates.length === 0 ? 0 : o.pad * 2 + dates.length * o.colWidth,
    height: dates.length === 0 ? 0 : tallest + o.pad,
  }
}
