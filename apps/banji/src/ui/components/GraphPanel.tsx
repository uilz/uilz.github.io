// 图模式（R8·D3）：时间轴上的纸串，不是网络拓扑图。日期=墨印分栏（历法升序向右），
// 纸=8 字 snippet 的小纸片（附件换-kind 图标；容器孩子缩进悬母片之下），线=发丝贝塞尔。
// 底料 loadAllCards/loadAllEdges 入场各读一次（不是每帧——R1 风险注仍有效）；只读、无 zoom、无拖拽重排。
import { useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import type { BanjiApp, CardAt } from '../../application'
import type { CardId, EdgeRecord } from '../../domain/types'
import { isPlainObject } from '../../domain/validation'
import { resolveRenderer } from '../cards/registry'
import { graphLayout, type GraphEntry } from '../graphLayout'
import { shortDateLabel } from '../labels'
import { CardTypeIcon } from './icons'

const SNIPPET_LEN = 8

/** chip 的脸：8 字 snippet（取命中不了花活——就第一行前八字），附件亮 kind 图标、无名可展。 */
function graphEntryOf({ date, card }: CardAt): GraphEntry {
  const props = card.props
  const text = isPlainObject(props) && typeof props['text'] === 'string' ? props['text'].trim().replace(/\s+/g, ' ').slice(0, SNIPPET_LEN) : ''
  const url = isPlainObject(props) && typeof props['url'] === 'string' ? props['url'].trim().slice(0, SNIPPET_LEN) : ''
  const snippet = card.kind === 'container' ? '一叠纸' : text === '' ? url : text
  return {
    cardId: card.id,
    date,
    createdAt: card.createdAt,
    snippet,
    icon: resolveRenderer(card.kind).iconKind,
    children: card.children ?? [],
  }
}

interface GraphPanelProps {
  readonly app: BanjiApp
  /** 点 chip：退出图模式、翻到那天、暖脉冲那张纸（瞬态通道与搜索共用）。 */
  readonly onOpenCard: (date: string, cardId: CardId) => void
}

export function GraphPanel({ app, onOpenCard }: GraphPanelProps): ReactElement {
  const [world, setWorld] = useState<{ readonly cards: readonly CardAt[]; readonly edges: readonly EdgeRecord[] } | null>(null)
  useEffect(() => {
    let live = true
    void Promise.all([app.loadAllCards(), app.loadAllEdges()]).then(([cards, edges]) => {
      if (live) setWorld({ cards, edges })
    })
    return () => {
      live = false
    }
  }, [app])
  const layout = useMemo(() => (world === null ? null : graphLayout(world.cards.map(graphEntryOf), world.edges)), [world])

  if (world === null) {
    return (
      <div className="bj-graph" data-graph>
        <p className="bj-graph-whisper">正在铺开这些年的纸…</p>
      </div>
    )
  }
  if (layout === null || layout.chips.length === 0) {
    return (
      <div className="bj-graph" data-graph>
        <p className="bj-graph-whisper">笔还没落，纸串自然是空的。</p>
      </div>
    )
  }
  return (
    <div className="bj-graph" data-graph>
      <div className="bj-graph-scroll" data-graph-scroll>
        <div className="bj-graph-field" data-graph-field style={{ width: layout.width, height: layout.height }}>
          {layout.columns.map((col) => (
            <span key={col.date} className="bj-graph-day" data-graph-col={col.date} style={{ left: col.x }}>
              {shortDateLabel(col.date)}
            </span>
          ))}
          <svg className="bj-graph-lines" width={layout.width} height={layout.height} aria-hidden>
            {layout.lines.map((ln) => (
              <path key={ln.id} className="bj-graph-line" data-graph-line={`${String(ln.from)}→${String(ln.to)}`} d={ln.d} />
            ))}
          </svg>
          {layout.chips.map((chip) => (
            <button
              key={chip.entry.cardId}
              type="button"
              className="bj-graph-chip"
              data-graph-chip={String(chip.entry.cardId)}
              data-graph-date={chip.entry.date}
              style={{ left: chip.x, top: chip.y, width: chip.w, height: chip.h }}
              title={`${shortDateLabel(chip.entry.date)} · 翻开这一天`}
              onClick={() => { onOpenCard(chip.entry.date, chip.entry.cardId) }}
            >
              {chip.entry.icon === 'text' ? null : <CardTypeIcon kind={chip.entry.icon} />}
              {chip.entry.icon === 'text' || chip.entry.snippet !== '' ? <span className="bj-graph-snippet">{chip.entry.snippet}</span> : null}
            </button>
          ))}
        </div>
      </div>
      <p className="bj-graph-hint">左右推移逛时间 · 点一张小纸翻回它的那天</p>
    </div>
  )
}
