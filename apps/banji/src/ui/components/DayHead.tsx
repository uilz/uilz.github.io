// 日页眉：回历、题字、「卡片/线/图」三段低语（R8·D3 图模式上架）、设置。
interface DayHeadProps {
  readonly title: string
  /** 'cards' | 'thread' | 'graph'（由 DayView 的 gaze 映射出字符串供高亮）。 */
  readonly gaze: 'cards' | 'thread' | 'graph'
  readonly onGaze: (gaze: 'cards' | 'thread' | 'graph') => void
  readonly onOpenSettings: () => void
}

import type { ReactElement } from 'react'
import { IconChevronLeft, IconGear } from './icons'

export function DayHead({ title, gaze, onGaze, onOpenSettings }: DayHeadProps): ReactElement {
  return (
    <header className="bj-day-head">
      <a className="bj-back" href="#/" aria-label="回到月历">
        <IconChevronLeft size={18} />
        <span>手札</span>
      </a>
      <h2 className="bj-day-title">{title}</h2>
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
