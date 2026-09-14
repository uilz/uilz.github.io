// V2 Iter2·H3 月格与墨 —— 从 CalendarView 拆出的格层：分档墨点（s/m/l=3/4.5/6px·α.5/.7/.9）、
// 贴过照片的日子挂 6px 发丝折角（无别针、无填色），今天保留细环。
import type { ReactElement } from 'react'
import { dayHref } from '../router'
import { inkOf } from '../calendarModel'
import { WEEKDAYS_MONDAY } from '../labels'
import { monthOf } from '../../domain/date'

interface MonthGridProps {
  readonly weeks: readonly (readonly string[])[]
  readonly marks: ReadonlyMap<string, number>
  readonly folds: ReadonlySet<string>
  readonly thisMonth: string
  readonly today: string
}

export function MonthGrid({ weeks, marks, folds, thisMonth, today }: MonthGridProps): ReactElement {
  return (
    <>
      <div className="bj-weekdays" aria-hidden>
        {WEEKDAYS_MONDAY.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="bj-grid">
        {weeks.flat().map((date) => {
          const foreign = monthOf(date) !== thisMonth
          const isToday = date === today
          const ink = inkOf(marks.get(date) ?? 0, folds.has(date) && marks.has(date))
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
              {ink.fold ? (
                <svg className="bj-fold" width="7" height="7" viewBox="0 0 7 7" aria-hidden>
                  <path d="M0.5 0.5 H6.5 V6.5 Z" fill="none" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
                </svg>
              ) : null}
              <span className="bj-cell-num">{String(Number(date.slice(8, 10)))}</span>
              {ink.tier === null ? null : <i className="bj-dot" data-tier={ink.tier} aria-hidden />}
            </button>
          )
        })}
      </div>
    </>
  )
}
