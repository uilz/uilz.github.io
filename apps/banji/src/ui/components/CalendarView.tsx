// V2 Iter2 首页总装 —— 字标行 → 今日面（书脊）→ 月题导航 → 月格 → 时间账。
// 取数两笔各守各的账：月格墨点随 ym 走既有 getMonthSummary；今日面/账/门走 getHomeDigest
// ——每次进月历恰一读（换月、重渲不复扫，loadAll 纪律）。逻辑全在 calendarModel 纯函数层。
import { useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import type { BanjiApp, HomeDigest } from '../../application'
import { monthMatrix } from '../../domain/date'
import {
  FRESH_WHISPER,
  bandView,
  journalFoot,
  shiftMonth,
  ymKey,
  ymOfDate,
} from '../calendarModel'
import type { Ym } from '../calendarModel'
import { IconChevronLeft, IconChevronRight, IconGear, IconSearch } from './icons'
import { TodayBand } from './TodayBand'
import { MonthGrid } from './MonthGrid'
import { JumpSheet } from './JumpSheet'

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
  const [home, setHome] = useState<HomeDigest | null>(null)
  const [jumpOpen, setJumpOpen] = useState(false)

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

  useEffect(() => {
    let alive = true
    void app.getHomeDigest(today).then((d) => {
      if (!alive) return
      setHome(d)
    })
    return () => {
      alive = false
    }
  }, [app, today, reloadKey])

  const folds = useMemo<ReadonlySet<string>>(
    () => new Set((home?.days ?? []).filter((d) => d.hasImage).map((d) => d.date)),
    [home],
  )
  const monthLabel = `${String(ym.y)}年${String(ym.m)}月`
  const isHereMonth = ymKey(ym) === ymOfDate(today)

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
      {home === null ? null : <TodayBand band={bandView(home, today)} today={today} />}
      <nav className="bj-month-nav" aria-label="月份切换">
        <button type="button" className="bj-quiet-btn" aria-label="上一月" onClick={() => setYm(shiftMonth(ym, -1))}>
          <IconChevronLeft />
        </button>
        <button type="button" className="bj-month-label bj-month-jump" data-month-jump title="翻到任意一月" onClick={() => setJumpOpen(true)}>
          {monthLabel}
        </button>
        <div className="bj-month-right">
          <button
            type="button"
            className={`bj-today-btn${isHereMonth ? ' is-here' : ''}`}
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
      <MonthGrid weeks={monthMatrix(ym.y, ym.m)} marks={marks} folds={folds} thisMonth={ymKey(ym)} today={today} />
      <p className="bj-cal-foot" data-journal-foot>
        {home === null ? FRESH_WHISPER : journalFoot(home, ymKey(ym), ymOfDate(today))}
      </p>
      {jumpOpen ? (
        <JumpSheet
          days={home?.days ?? []}
          viewing={ym}
          today={today}
          onJump={(next) => {
            setYm(next)
            setJumpOpen(false)
          }}
          onClose={() => { setJumpOpen(false) }}
        />
      ) : null}
    </div>
  )
}
