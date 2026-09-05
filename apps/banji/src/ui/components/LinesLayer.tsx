// 同日连线的画层（D2）+ 撕线签（D3）。SVG 铺在纸下、页上：一笔二次贝塞尔，
// 发丝 1px 暖棕 40%——是铅笔淡痕，不是电路图：无箭头、无辉光、无动效 dash。
import type { ReactElement } from 'react'
import type { Card, CardId, EdgeRecord } from '../../domain/types'
import { centerOf, lineShape } from '../linkage'

interface InkedLine {
  readonly edge: EdgeRecord
  readonly d: string
  readonly mid: { x: number; y: number }
}

interface LinesLayerProps {
  readonly cards: readonly Card[]
  readonly links: readonly EdgeRecord[]
  readonly hotId: CardId | null
  /** 撕线签住着的边（D3）：点线请出，点签撕线，Esc/失焦退场。 */
  readonly chipId: string | null
  readonly onChip: (id: string | null) => void
  readonly onRemoveLine: (id: string) => void
  /** 牵线进行中：纸黄昏罩着画层，此刻不请撕线签。 */
  readonly linking: boolean
}

/** 只画两端都住在本日的线（跨日线由线模式讲故事）。 */
function inked(cards: readonly Card[], links: readonly EdgeRecord[]): InkedLine[] {
  const byId = new Map<string, Card>(cards.map((c) => [c.id, c]))
  const out: InkedLine[] = []
  for (const e of links) {
    const a = byId.get(e.source)
    const b = byId.get(e.target)
    if (a === undefined || b === undefined) continue
    const shape = lineShape(centerOf(a), centerOf(b), a.id, b.id)
    if (shape === null) continue
    out.push({ edge: e, d: shape.d, mid: shape.mid })
  }
  return out
}

export function LinesLayer({ cards, links, hotId, chipId, onChip, onRemoveLine, linking }: LinesLayerProps): ReactElement | null {
  const lines = inked(cards, links)
  if (lines.length === 0) return null
  const chip = chipId === null ? undefined : lines.find((l) => l.edge.id === chipId)
  return (
    <>
      <svg className="bj-lines" width="100%" height="100%" aria-hidden>
        {lines.map((l) => {
          const hot = hotId !== null && (l.edge.source === hotId || l.edge.target === hotId)
          return (
            <g key={l.edge.id} className={`bj-line${hot ? ' is-hot' : ''}`} data-line-id={l.edge.id} data-source={l.edge.source} data-target={l.edge.target}>
              <path className="bj-line-ink" d={l.d} />
              <path
                className="bj-line-hit"
                d={l.d}
                onPointerDown={(e) => {
                  e.stopPropagation() // 线在纸下，但点线不该被当成「点空纸面」
                  if (!linking) onChip(chipId === l.edge.id ? null : l.edge.id)
                }}
              />
            </g>
          )
        })}
      </svg>
      {chip === undefined ? null : (
        <button
          type="button"
          className="bj-line-chip"
          data-line-chip={chip.edge.id}
          style={{ left: chip.mid.x, top: chip.mid.y }}
          onPointerDown={(e) => e.stopPropagation()}
          onBlur={() => onChip(null)}
          onClick={() => {
            onChip(null)
            onRemoveLine(chip.edge.id)
          }}
        >
          撕线
        </button>
      )}
    </>
  )
}
