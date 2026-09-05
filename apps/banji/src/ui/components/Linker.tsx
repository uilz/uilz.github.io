// 牵线模式的招呼（D1）：一枚安静的「牵给近日…」文本钮 + 近 14 日纸单。
// 纸单跨日牵线是「跨时间探索」的种子；role 休眠，列表只认人与日子，不认关系名。
import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import type { BanjiApp, RecentCard } from '../../application'
import { pairKey } from '../../domain/edges'
import { isPlainObject } from '../../domain/validation'
import { shortDateLabel } from '../labels'
import type { Card, CardId, EdgeRecord } from '../../domain/types'

/** 「近日」的窗：回看 14 天（任务书 D1 拍板）。 */
const RECENT_DAYS = 14

function snippetOf(r: RecentCard): string {
  if (r.assetName !== undefined) return r.assetName
  const props = r.card.props
  const text = isPlainObject(props) && typeof props['text'] === 'string' ? props['text'] : ''
  if (text.trim() !== '') return text.trim().replace(/\s+/g, ' ').slice(0, 22)
  return r.card.kind === 'container' ? '一叠纸' : '这一天的纸片'
}

interface LinkerProps {
  readonly app: BanjiApp
  readonly date: string
  readonly originId: CardId
  readonly links: readonly EdgeRecord[]
  readonly onLink: (target: CardId) => void
}

export function Linker({ app, date, originId, links, onLink }: LinkerProps): ReactElement {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<readonly RecentCard[] | null>(null)
  useEffect(() => {
    if (!open) return
    let live = true
    void app.getRecentCards(date, RECENT_DAYS).then((rs) => {
      if (live) setItems(rs)
    })
    return () => {
      live = false
    }
  }, [open, app, date])
  useEffect(() => {
    setOpen(false)
    setItems(null)
  }, [originId])
  const taken = new Set(links.filter((e) => e.source === originId || e.target === originId).map((e) => pairKey(e.source, e.target)))
  const rows = (items ?? []).filter((r) => !taken.has(pairKey(originId, r.card.id)))
  return (
    <div className="bj-linker-bar" data-linker>
      <p className="bj-linker-hint">点一张纸把它牵过来 · 再点原纸收线</p>
      <button type="button" className="bj-link-recent" onClick={() => setOpen((v) => !v)} disabled={items !== null && rows.length === 0}>
        牵给近日…
      </button>
      {open ? (
        <div className="bj-veil bj-link-veil" onPointerDown={() => setOpen(false)}>
          <div className="bj-link-modal" role="dialog" aria-label="牵给近日" onPointerDown={(e) => e.stopPropagation()}>
            <p className="bj-link-modal-title">线牵到哪张纸？</p>
            <div className="bj-scroll bj-link-list">
              {items === null ? (
                <p className="bj-link-quiet">正在翻近 {String(RECENT_DAYS)} 日的纸…</p>
              ) : rows.length === 0 ? (
                <p className="bj-link-quiet">近 {String(RECENT_DAYS)} 日没有可牵的纸</p>
              ) : (
                rows.map((r) => (
                  <button
                    key={r.card.id}
                    type="button"
                    className="bj-link-row"
                    onClick={() => {
                      setOpen(false)
                      onLink(r.card.id)
                    }}
                  >
                    <span className="bj-link-row-snippet">{snippetOf(r)}</span>
                    <span className="bj-link-row-date">{shortDateLabel(r.date)}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
