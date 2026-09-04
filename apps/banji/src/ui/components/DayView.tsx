import type { ReactElement } from 'react'
import type { DayStore } from '../store'
import type { BanjiApp } from '../../application'
import { weekdayMondayIndex } from '../../domain/date'
import { WEEKDAYS_MONDAY } from '../labels'
import { CardFrame } from './CardFrame'
import { IconChevronLeft, IconGear } from './icons'

function dateTitle(date: string): string {
  const y = date.slice(0, 4)
  const m = String(Number(date.slice(5, 7)))
  const d = String(Number(date.slice(8, 10)))
  const w = WEEKDAYS_MONDAY[weekdayMondayIndex(date)]
  return `${y}年${m}月${d}日 · 周${w ?? ''}`
}

interface DayViewProps {
  readonly app: BanjiApp
  readonly date: string
  readonly store: DayStore
  readonly onOpenSettings: () => void
}

export function DayView({ app, date, store, onOpenSettings }: DayViewProps): ReactElement {
  const { state, actions } = store
  const sorted = [...state.cards].sort((a, b) => (a.z ?? 0) - (b.z ?? 0))
  const canvasW = Math.max(600, ...sorted.map((c) => c.pos.x + c.size.w + 200))
  const canvasH = Math.max(480, ...sorted.map((c) => c.pos.y + c.size.h + 200))
  return (
    <div className="bj-day" data-day-view>
      <header className="bj-day-head">
        <a className="bj-back" href="#/" aria-label="回到月历">
          <IconChevronLeft size={18} />
          <span>手札</span>
        </a>
        <h2 className="bj-day-title">{dateTitle(date)}</h2>
        <button type="button" className="bj-quiet-btn" aria-label="设置" onClick={onOpenSettings}>
          <IconGear />
        </button>
      </header>
      <div
        className="bj-scroll"
        onPointerDown={(e) => {
          const t = e.target
          if (t instanceof Element && t.closest('[data-card]') === null) {
            if (state.editingId !== null) actions.exitEdit()
            else actions.select(null)
          }
        }}
      >
        <div className="bj-canvas" style={{ width: canvasW, height: canvasH }}>
          {state.loaded && sorted.length === 0 ? <p className="bj-empty">这一天还是空白。落一笔吧。</p> : null}
          {sorted.map((card, i) => (
            <CardFrame
              key={card.id}
              card={card}
              app={app}
              date={date}
              actions={actions}
              selected={state.selectedId === card.id}
              editing={state.editingId === card.id}
              z={i + 1}
              justBorn={state.lastAddedId === card.id}
            />
          ))}
        </div>
      </div>
      <div className="bj-add-wrap">
        <button type="button" className="bj-add" onClick={() => actions.addTextCard()}>
          添一张卡
        </button>
      </div>
    </div>
  )
}
