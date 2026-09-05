import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import type { BanjiApp } from '../../application'
import { monthMatrix, monthOf } from '../../domain/date'
import { dayHref } from '../router'
import { WEEKDAYS_MONDAY } from '../labels'
import { IconChevronLeft, IconChevronRight, IconGear, IconSearch } from './icons'

export interface Ym {
  readonly y: number
  readonly m: number
}

function shiftMonth({ y, m }: Ym, delta: number): Ym {
  const idx = y * 12 + (m - 1) + delta
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 }
}

function tierOf(count: number): 1 | 2 | 3 {
  if (count >= 5) return 3
  if (count >= 2) return 2
  return 1
}

interface CalendarViewProps {
  readonly app: BanjiApp
  readonly today: string
  readonly reloadKey: number
  readonly onOpenSettings: () => void
  readonly onOpenSearch: () => void
}

export function CalendarView({ app, today, reloadKey, onOpenSettings, onOpenSearch }: CalendarViewProps): ReactElement {
  const [ym, setYm] = useState<Ym>(() => {
    const t = today.split('-')
    return { y: Number(t[0]), m: Number(t[1]) }
  })
  const [marks, setMarks] = useState<ReadonlyMap<string, number>>(new Map())

  useEffect(() => {
    let alive = true
    void app.getMonthSummary(ym.y, ym.m).then((list) => {
      if (!alive) return
      setMarks(new Map(list.map((r): [string, number] => [r.date, r.cardCount])))
    })
    return () => {
      alive = false
    }
  }, [app, ym, reloadKey])

  const monthLabel = `${String(ym.y)}年${String(ym.m)}月`
  const thisMonth = `${String(ym.y).padStart(4, '0')}-${String(ym.m).padStart(2, '0')}`
  const weeks = monthMatrix(ym.y, ym.m)

  return (
    <div className="bj-cal">
      <header className="bj-cal-head">
        <h1 className="bj-wordmark">伴记</h1>
        <div className="bj-cal-head-btns">
          <button type="button" className="bj-quiet-btn" aria-label="搜索手札" title="想找哪一笔？（⌘F）" onClick={onOpenSearch} data-search-open>
            <IconSearch />
          </button>
          <button type="button" className="bj-quiet-btn" aria-label="设置" onClick={onOpenSettings}>
            <IconGear />
          </button>
        </div>
      </header>
      <nav className="bj-month-nav" aria-label="月份切换">
        <button type="button" className="bj-quiet-btn" aria-label="上一月" onClick={() => setYm(shiftMonth(ym, -1))}>
          <IconChevronLeft />
        </button>
        <span className="bj-month-label">{monthLabel}</span>
        <div className="bj-month-right">
          <button
            type="button"
            className={`bj-today-btn${ym.y === Number(today.slice(0, 4)) && ym.m === Number(today.slice(5, 7)) ? ' is-here' : ''}`}
            onClick={() => {
              const t = today.split('-')
              setYm({ y: Number(t[0]), m: Number(t[1]) })
            }}
          >
            回到今天
          </button>
          <button type="button" className="bj-quiet-btn" aria-label="下一月" onClick={() => setYm(shiftMonth(ym, 1))}>
            <IconChevronRight />
          </button>
        </div>
      </nav>
      <div className="bj-weekdays" aria-hidden>
        {WEEKDAYS_MONDAY.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="bj-grid">
        {weeks.flat().map((date) => {
          const foreign = monthOf(date) !== thisMonth
          const count = marks.get(date)
          const isToday = date === today
          return (
            <button
              type="button"
              key={date}
              data-date={date}
              data-today={isToday ? 'true' : undefined}
              className={`bj-cell${foreign ? ' bj-dim' : ''}${isToday ? ' bj-today' : ''}`}
              onClick={() => {
                window.location.hash = dayHref(date)
              }}
            >
              <span className="bj-cell-num">{String(Number(date.slice(8, 10)))}</span>
              {count !== undefined ? <i className="bj-dot" data-tier={tierOf(count)} aria-hidden /> : null}
            </button>
          )
        })}
      </div>
      <p className="bj-cal-foot">翻开即今日，落笔即永远。</p>
    </div>
  )
}
