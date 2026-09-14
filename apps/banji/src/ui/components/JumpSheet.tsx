// V2 Iter2·H4 翻到 —— 任意天之门：月题一按，纸片自下升起（搜索纸片同款slide）。
// 当年 12 格 + 年份 ‹ › + 回到今天；墨点=该月有纸（全部从首页一次读的 days 底料派生，零再扫库）。
// 纯屏幕瞬态：开合、年份目光住本组件，永不过缝。
import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactElement } from 'react'
import type { DayMark } from '../../application'
import { shiftMonth, yearMonthFlags, ymOfDate } from '../calendarModel'
import type { Ym } from '../calendarModel'
import { IconChevronLeft, IconChevronRight } from './icons'

const LEAVE_MS = 180
const SWIPE_DOWN_PX = 28

interface JumpSheetProps {
  readonly days: readonly DayMark[]
  readonly viewing: Ym
  readonly today: string
  readonly onJump: (ym: Ym) => void
  readonly onClose: () => void
}

export function JumpSheet({ days, viewing, today, onJump, onClose }: JumpSheetProps): ReactElement {
  const [year, setYear] = useState(viewing.y)
  const [leaving, setLeaving] = useState(false)
  const leaveTimer = useRef<number | null>(null)
  const dragRef = useRef<{ y0: number } | null>(null)

  const leave = (after: () => void): void => {
    setLeaving(true)
    leaveTimer.current = window.setTimeout(after, LEAVE_MS)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') leave(onClose)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current)
    }
  }, [])

  const flags = yearMonthFlags(days, year)
  const todayYm = ymOfDate(today)
  const onGrabMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (dragRef.current !== null && e.clientY - dragRef.current.y0 > SWIPE_DOWN_PX) {
      dragRef.current = null
      leave(onClose)
    }
  }

  return (
    <>
      <div className="bj-scrim" onClick={onClose} />
      <section className={`bj-jump${leaving ? ' is-out' : ''}`} role="dialog" aria-label="翻到" data-jump-sheet>
        <div className="bj-jump-grab" data-jump-grab onPointerDown={(e) => { dragRef.current = { y0: e.clientY } }} onPointerMove={onGrabMove} onPointerUp={() => { dragRef.current = null }}>
          <i className="bj-jump-bar" aria-hidden />
        </div>
        <nav className="bj-jump-nav" aria-label="年份切换">
          <button type="button" className="bj-quiet-btn" aria-label="上一年" data-jump-prev-year onClick={() => { setYear(year - 1) }}>
            <IconChevronLeft />
          </button>
          <span className="bj-jump-year">{String(year)}年</span>
          <button type="button" className="bj-quiet-btn" aria-label="下一年" data-jump-next-year onClick={() => { setYear(year + 1) }}>
            <IconChevronRight />
          </button>
        </nav>
        <div className="bj-jump-grid">
          {flags.map((has, i) => {
            const key = `${String(year).padStart(4, '0')}-${String(i + 1).padStart(2, '0')}`
            const isHere = key === `${String(viewing.y).padStart(4, '0')}-${String(viewing.m).padStart(2, '0')}`
            return (
              <button
                type="button"
                key={key}
                data-jump-month={key}
                className={`bj-jump-cell${isHere ? ' is-here' : ''}${key === todayYm ? ' bj-now' : ''}`}
                onClick={() => {
                  leave(() => {
                    onJump(shiftMonth({ y: year, m: 1 }, i))
                  })
                }}
              >
                <span className="bj-jump-m">{String(i + 1)}月</span>
                {has ? <i className="bj-jump-dot" aria-hidden /> : null}
              </button>
            )
          })}
        </div>
        <div className="bj-jump-foot">
          <button
            type="button"
            className="bj-jump-today"
            onClick={() => {
              const t = today.split('-')
              leave(() => {
                onJump({ y: Number(t[0]), m: Number(t[1]) })
              })
            }}
          >
            回到今天
          </button>
        </div>
      </section>
    </>
  )
}
