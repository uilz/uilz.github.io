// V2 Iter2·H1 今日面 —— 书脊，不是卡：无描边盒、无投影，排印层级挑梁，一线发丝与月历相隔。
// 三态：今天有纸（整脊可点→今天）/ 今天未落笔有史（「上次落笔」行可点→那一天，回到过去不设按钮）/ 新册空着。
import type { ReactElement } from 'react'
import type { BandView } from '../calendarModel'
import { dayHref } from '../router'

interface TodayBandProps {
  readonly band: BandView
  readonly today: string
}

function goDay(date: string): void {
  window.location.hash = dayHref(date)
}

export function TodayBand({ band, today }: TodayBandProps): ReactElement {
  const fadeKey = `${band.state}:${band.state === 'quiet' ? band.recentDate : ''}`
  return (
    <div className="bj-band" data-today-band data-band={band.state}>
      <div key={fadeKey} className="bj-band-in">
        {band.state === 'paper' ? (
          <button type="button" className="bj-band-tap" onClick={() => { goDay(today) }}>
            <p className="bj-band-head">
              今天<span className="bj-band-sep">·</span>
              <span className="bj-band-num">{String(band.count)}</span>
              <span className="bj-band-unit"> 张纸</span>
            </p>
            {band.excerpt === null ? null : <p className="bj-band-line">{band.excerpt}</p>}
          </button>
        ) : band.state === 'quiet' ? (
          <>
            <p className="bj-band-head">
              今天<span className="bj-band-sep">·</span>未落笔
            </p>
            <button type="button" className="bj-band-recent" data-band-jump={band.recentDate} onClick={() => { goDay(band.recentDate) }}>
              上次落笔 · <span className="bj-band-recent-date">{band.recentLabel}</span>
              {band.excerpt === null ? '' : `「${band.excerpt}」`}
            </button>
          </>
        ) : (
          <p className="bj-band-head">
            今天<span className="bj-band-sep">·</span>空着
          </p>
        )}
      </div>
    </div>
  )
}
