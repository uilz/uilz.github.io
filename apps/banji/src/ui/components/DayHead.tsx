// 日页眉：回历、铅笔钩的翻页细钩夹着题字、「卡片/线/图」三段低语、设置。
// V2-Iter1：‹ › 隔日细钩（#2 时间导航）+ 纵深耳语（昨天/N 天前）+ 窄屏单行不破版（#1）。
// 日期两副面孔由 CSS 换装（桌面全字/窄屏紧凑），本层把零件一次摆齐。
import type { ReactElement } from 'react'
import { addDays } from '../../domain/date'
import { depthLabel } from '../../domain/depth'
import { dateParts } from '../labels'
import { dayHref } from '../router'
import { IconChevronLeft, IconChevronRight, IconGear } from './icons'

interface DayHeadProps {
  readonly date: string
  readonly today: string
  readonly title: string
  /** 'cards' | 'thread' | 'graph'（由 DayView 的 gaze 映射出字符串供高亮）。 */
  readonly gaze: 'cards' | 'thread' | 'graph'
  readonly onGaze: (gaze: 'cards' | 'thread' | 'graph') => void
  readonly onOpenSettings: () => void
}

export function DayHead({ date, today, title, gaze, onGaze, onOpenSettings }: DayHeadProps): ReactElement {
  const parts = dateParts(date, today)
  const depth = depthLabel(date, today)
  return (
    <header className="bj-day-head">
      <a className="bj-back" href="#/" aria-label="回到月历">
        <IconChevronLeft size={18} />
        <span className="bj-back-label">手札</span>
      </a>
      <div className="bj-day-nav">
        <a className="bj-day-arrow" data-day-nav="prev" href={dayHref(addDays(date, -1))} aria-label="前一天">
          <IconChevronLeft size={13} />
        </a>
        <h2 className="bj-day-title">
          <span className="bj-date-full">{title}</span>
          <span className={`bj-date-narrow${parts.year === null ? '' : ' is-xyear'}`}>
            {parts.year !== null ? <span className="bj-date-year">{parts.year}</span> : null}
            {parts.md}
            <span className="bj-date-weekday"> {parts.weekday}</span>
          </span>
          {depth === null ? null : <span className="bj-day-depth" data-day-depth>{depth}</span>}
        </h2>
        <a className="bj-day-arrow" data-day-nav="next" href={dayHref(addDays(date, 1))} aria-label="后一天">
          <IconChevronRight size={13} />
        </a>
      </div>
      <div className="bj-mode-seg" role="group" aria-label="日视图模式">
        <button type="button" className={`bj-mode-seg-btn${gaze === 'cards' ? ' is-on' : ''}`} onClick={() => onGaze('cards')}>
          卡片
        </button>
        <button type="button" data-mode="thread" className={`bj-mode-seg-btn${gaze === 'thread' ? ' is-on' : ''}`} onClick={() => onGaze('thread')}>
          线
        </button>
        <button type="button" data-mode="graph" className={`bj-mode-seg-btn${gaze === 'graph' ? ' is-on' : ''}`} onClick={() => onGaze('graph')}>
          图
        </button>
      </div>
      <button type="button" className="bj-quiet-btn" aria-label="设置" onClick={onOpenSettings}>
        <IconGear />
      </button>
    </header>
  )
}
