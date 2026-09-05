// 线模式（D5）：一张纸的连通分量串成一层一层珠子——是一串珠子不是一张网。
// 层=链距离（锚点居首）、层内=日期升序；日期换组处落一枚墨印日子签。点珠=翻回卡片模式开那一天。
// 底料 = loadAllCards + loadAllEdges 一次性全扫（千级=档案尺度的读，任务书拍板可负担）。只读、不留偏转移除不存账。
import { useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import type { BanjiApp } from '../../application'
import { isPlainObject } from '../../domain/validation'
import type { Card, CardId, EdgeRecord } from '../../domain/types'
import { threadRuns } from '../linkage'
import { shortDateLabel } from '../labels'

/** 珠子：卡片在某天的可见化身。 */
export interface Bead {
  readonly cardId: CardId
  readonly date: string
  readonly snippet: string
}

export function cardBead(date: string, card: Card): Bead {
  if (card.kind === 'container') return { cardId: card.id, date, snippet: '一叠纸' }
  const props = card.props
  const text = isPlainObject(props) && typeof props['text'] === 'string' ? props['text'] : ''
  return { cardId: card.id, date, snippet: text.trim() === '' ? '这一天的纸片' : text.trim().replace(/\s+/g, ' ').slice(0, 18) }
}

/** 串珠子（纯计算，单测钉死）：BFS 分层 → 每层珠子镶 snippet；端点无卡的病态珠跳过。 */
export function threadBeads(beads: readonly Bead[], edges: readonly EdgeRecord[], anchor: CardId): readonly { depth: number; beads: readonly Bead[] }[] {
  const byId = new Map(beads.map((b) => [b.cardId, b]))
  return threadRuns(anchor, edges, (id) => {
    const b = byId.get(id)
    return b === undefined ? undefined : { date: b.date }
  }).map((run) => ({
    depth: run.depth,
    beads: run.beads.flatMap((x) => {
      const b = byId.get(x.cardId)
      return b === undefined ? [] : [b]
    }),
  }))
}

interface Labeled {
  readonly bead: Bead
  /** 非 null = 这枚珠开启新的一天（墨印是组「间」的分隔，头一枚不挂）。 */
  readonly day: string | null
}

function labelRuns(runs: readonly { depth: number; beads: readonly Bead[] }[]): { depth: number; beads: readonly Labeled[] }[] {
  let last = ''
  let first = true
  return runs.map((run) => ({
    depth: run.depth,
    beads: run.beads.map((bead) => {
      const day = first || bead.date === last ? null : bead.date
      first = false
      last = bead.date
      return { bead, day }
    }),
  }))
}

interface ThreadPanelProps {
  readonly app: BanjiApp
  readonly anchor: CardId | null
  /** 点珠：回卡片模式并落在珠子的日子。 */
  readonly onOpenDate: (date: string) => void
}

export function ThreadPanel({ app, anchor, onOpenDate }: ThreadPanelProps): ReactElement {
  const [world, setWorld] = useState<{ readonly beads: readonly Bead[]; readonly edges: readonly EdgeRecord[] } | null>(null)
  useEffect(() => {
    let live = true
    void Promise.all([app.loadAllCards(), app.loadAllEdges()]).then(([cards, edges]) => {
      if (live) setWorld({ beads: cards.map((x) => cardBead(x.date, x.card)), edges })
    })
    return () => {
      live = false
    }
  }, [app])
  const runs = useMemo(() => (world === null || anchor === null ? null : labelRuns(threadBeads(world.beads, world.edges, anchor))), [world, anchor])
  if (anchor === null) {
    return (
      <div className="bj-thread" data-thread>
        <p className="bj-thread-whisper">挑一张纸，看它牵过的线</p>
      </div>
    )
  }
  return (
    <div className="bj-thread" data-thread data-anchor={anchor}>
      {runs === null ? (
        <p className="bj-thread-whisper">正在翻它牵过的线…</p>
      ) : (
        <div className="bj-thread-strip" data-thread-strip>
          {runs.map((run) => (
            <span key={run.depth} className="bj-thread-run" data-thread-depth={String(run.depth)}>
              {run.beads.map(({ bead, day }, bi) => (
                <span key={bead.cardId} className="bj-thread-slot">
                  {bi === 0 && run.depth === 0 ? null : <span className="bj-thread-seg" aria-hidden />}
                  {day === null ? null : (
                    <span className="bj-thread-day" data-thread-day={day}>
                      {shortDateLabel(day)}
                    </span>
                  )}
                  <button
                    type="button"
                    className="bj-thread-bead"
                    data-thread-node={bead.cardId}
                    data-date={bead.date}
                    title={`${shortDateLabel(bead.date)} · 翻开这一天`}
                    onClick={() => onOpenDate(bead.date)}
                  >
                    <span className="bj-thread-snippet">{bead.snippet}</span>
                    <span className="bj-thread-bead-date">{shortDateLabel(bead.date)}</span>
                  </button>
                </span>
              ))}
            </span>
          ))}
        </div>
      )}
      <p className="bj-thread-hint">点一颗珠，翻回它的那天</p>
    </div>
  )
}
