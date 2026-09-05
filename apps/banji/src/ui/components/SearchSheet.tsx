// 全局搜索纸面（R8·D1）：日历页眉放大镜 / ⌘F 请出的上升纸片——翻旧纸，不是搜索引擎。
// 状态全住本组件瞬态（输入、debounce、退场），永不过缝、不落历史；结果按日分组（新日在前），
// 行=书口日期签 + snippet 切片赭底高亮（React 文本节点，绝无声称 HTML 的路）。
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactElement } from 'react'
import type { AssetMeta, BanjiApp, CardAt } from '../../application'
import type { CardId } from '../../domain/types'
import { searchCards, type SearchHit } from '../../domain/search'
import { shortDateLabel } from '../labels'

const DEBOUNCE_MS = 250
const LEAVE_MS = 180
const SWIPE_DOWN_PX = 28

interface Corpus {
  readonly cards: readonly CardAt[]
  readonly meta: readonly AssetMeta[]
}

interface SearchSheetProps {
  readonly app: BanjiApp
  readonly onPick: (date: string, cardId: CardId) => void
  readonly onClose: () => void
}

/** 按日分组次序（D1「新日在前」）：日期降序；sort 稳定，日内保持搜索器的 rank 序。 */
function groupByNewestDay(hits: readonly SearchHit[]): SearchHit[] {
  return [...hits].sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1))
}

export function SearchSheet({ app, onPick, onClose }: SearchSheetProps): ReactElement {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [corpus, setCorpus] = useState<Corpus | null>(null)
  const [leaving, setLeaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dragRef = useRef<{ y0: number } | null>(null)
  const leaveTimer = useRef<number | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])
  useEffect(() => {
    let live = true
    void Promise.all([app.loadAllCards(), app.loadAllAssetMeta()]).then(([cards, meta]) => {
      if (live) setCorpus({ cards, meta })
    })
    return () => {
      live = false
    }
  }, [app])
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query), DEBOUNCE_MS)
    return () => {
      window.clearTimeout(t)
    }
  }, [query])

  const leave = (): void => {
    setLeaving(true)
    leaveTimer.current = window.setTimeout(onClose, LEAVE_MS)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') leave()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current)
    }
  }, [])

  const rows = useMemo<readonly SearchHit[]>(
    () => (corpus === null ? [] : groupByNewestDay(searchCards(corpus.cards, corpus.meta, debounced))),
    [corpus, debounced],
  )
  const trimmed = debounced.trim()

  const onHeadPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    dragRef.current = { y0: e.clientY }
  }
  const onHeadPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (dragRef.current !== null && e.clientY - dragRef.current.y0 > SWIPE_DOWN_PX) {
      dragRef.current = null
      leave()
    }
  }

  return (
    <>
      <div className="bj-scrim" onClick={onClose} />
      <section className={`bj-search${leaving ? ' is-out' : ''}`} role="dialog" aria-label="搜索手札" data-search-sheet>
        <div className="bj-search-grab" data-search-grab onPointerDown={onHeadPointerDown} onPointerMove={onHeadPointerMove} onPointerUp={() => { dragRef.current = null }}>
          <i className="bj-search-bar" aria-hidden />
          <input
            ref={inputRef}
            className="bj-search-input"
            type="text"
            aria-label="搜索笔记"
            placeholder="想找哪一笔…"
            value={query}
            onChange={(e) => { setQuery(e.target.value) }}
          />
        </div>
        <div className="bj-search-body" data-search-body>
          {corpus === null ? (
            <p className="bj-search-whisper">正在翻遍每一页纸…</p>
          ) : trimmed === '' ? (
            <p className="bj-search-whisper">想找哪一笔？</p>
          ) : rows.length === 0 ? (
            <p className="bj-search-whisper">没有哪页纸写过这个。</p>
          ) : (
            <ul className="bj-search-list" data-search-list>
              {rows.map((h) => (
                <li key={`${h.date}:${String(h.cardId)}`}>
                  <button
                    type="button"
                    className="bj-search-row"
                    data-search-row
                    data-search-date={h.date}
                    data-search-card={String(h.cardId)}
                    onClick={() => { onPick(h.date, h.cardId) }}
                  >
                    <span className="bj-search-day" data-search-day>{shortDateLabel(h.date)}</span>
                    <span className="bj-search-cut"><SearchCut hit={h} /></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {rows.length === 50 ? <p className="bj-search-more">只摊开这五十张，别的字也许更多。</p> : null}
        </div>
      </section>
    </>
  )
}

/** 高亮切片 = 三段 React 文本节点（搜索器只回 [start,end) 码元下标）。 */
function SearchCut({ hit }: { readonly hit: SearchHit }): ReactElement {
  return (
    <>
      {hit.snippet.slice(0, hit.start)}
      <span className="bj-search-hl" data-search-hl>{hit.snippet.slice(hit.start, hit.end)}</span>
      {hit.snippet.slice(hit.end)}
    </>
  )
}
