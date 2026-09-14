// V2 Iter2 首页纯账（calendarModel）：墨点分档+折角、摘录截断、今日面三态、时间账文句、翻到年轮。
import { describe, expect, it } from 'vitest'
import {
  FRESH_WHISPER,
  bandView,
  clipExcerpt,
  dotTier,
  inkOf,
  journalFoot,
  shiftMonth,
  yearMonthFlags,
  ymKey,
  ymOfDate,
} from '../src/ui/calendarModel'
import type { DayMark, HomeDigest } from '../src/application'

const mark = (date: string, count = 1, hasImage = false): DayMark => ({ date, count, hasImage })
const home = (over: Partial<HomeDigest>): HomeDigest => ({
  today: { count: 0, excerpt: null, newestAt: null },
  recent: null,
  stats: { totalDays: 0, lastDate: null },
  days: [],
  ...over,
})

describe('calendarModel: 月格墨账（H3·#6）', () => {
  it('分档：0/1/3/7 → none/s/m/l，折角旗跟贴照旗走', () => {
    expect(inkOf(0, false)).toEqual({ tier: null, fold: false })
    expect(dotTier(1)).toBe('s')
    expect(dotTier(3)).toBe('m')
    expect(dotTier(7)).toBe('l')
    expect(dotTier(0)).toBeNull()
    expect(inkOf(2, true)).toEqual({ tier: 'm', fold: true })
  })

  it('摘录上纸：24 字整留原样，25 字裁到 24 配省略号', () => {
    const s24 = '槐'.repeat(24)
    expect(clipExcerpt(s24)).toBe(s24)
    expect(clipExcerpt(`${s24}雨`)).toBe(`${s24}…`)
  })
})

describe('calendarModel: 今日面三态（H1·#3）', () => {
  it('新册无史 → fresh（哪怕今天也无纸）', () => {
    expect(bandView(home({}), '2026-01-15')).toEqual({ state: 'fresh' })
  })

  it('今天有纸 → paper：张数 + 首行摘录（截断）；无摘录时只剩张数', () => {
    const b = bandView(
      home({
        stats: { totalDays: 5, lastDate: '2026-01-15' },
        today: { count: 3, excerpt: { text: `雨后。楼下槐花开了。${'透'.repeat(20)}`, source: 'text' }, newestAt: 'u' },
      }),
      '2026-01-15',
    )
    expect(b.state).toBe('paper')
    if (b.state === 'paper') {
      expect(b.count).toBe(3)
      expect(b.excerpt).toBe(`雨后。楼下槐花开了。${'透'.repeat(14)}…`)
    }
    const noEx = bandView(home({ stats: { totalDays: 1, lastDate: '2026-01-15' }, today: { count: 1, excerpt: null, newestAt: null } }), '2026-01-15')
    expect(noEx).toEqual({ state: 'paper', count: 1, excerpt: null })
  })

  it('今天未落笔有史 → quiet：指向上次落笔那一天；史账与今天账同行', () => {
    const b = bandView(
      home({
        stats: { totalDays: 9, lastDate: '2026-01-11' },
        recent: { date: '2026-01-11', count: 2, excerpt: { text: '一页短纸', source: 'text' }, newestAt: 'u' },
      }),
      '2026-01-15',
    )
    expect(b).toEqual({ state: 'quiet', recentDate: '2026-01-11', recentLabel: '1月11日', excerpt: '一页短纸' })
  })
})

describe('calendarModel: 时间账文句（H2）', () => {
  const stats = { totalDays: 24, lastDate: '2026-09-12' }
  const days = [mark('2026-08-01'), mark('2026-08-03'), mark('2026-09-12')]

  it('新册 → 耳语原句（首页唯一的呼唤）', () => {
    expect(journalFoot(home({}), '2026-09', '2026-09')).toBe(FRESH_WHISPER)
  })

  it('看本月 → 「此册已记 N 日 · 最近 M月D日」', () => {
    expect(journalFoot(home({ stats, days }), '2026-09', '2026-09')).toBe('此册已记 24 日 · 最近 9月12日')
  })

  it('看别月 → 追加该月有纸日数（跨月连续是数字）；无纸月也如实记 0', () => {
    expect(journalFoot(home({ stats, days }), '2026-08', '2026-09')).toBe('此册已记 24 日 · 最近 9月12日 · 该月 2 日')
    expect(journalFoot(home({ stats, days }), '2026-07', '2026-09')).toBe('此册已记 24 日 · 最近 9月12日 · 该月 0 日')
  })
})

describe('calendarModel: 翻到年轮与月份算术（H4）', () => {
  it('yearMonthFlags：只点亮给定年有纸的月份，跨年不误伤', () => {
    const flags = yearMonthFlags([mark('2026-01-03'), mark('2026-12-31'), mark('2025-06-06')], 2026)
    expect(flags.filter(Boolean).length).toBe(2)
    expect(flags[0]).toBe(true)
    expect(flags[11]).toBe(true)
    expect(flags[5]).toBe(false)
    expect(yearMonthFlags([], 2027).every((f) => !f)).toBe(true)
  })

  it('shiftMonth 跨年/隔年复位；ymKey/ymOfDate 补零一致', () => {
    expect(shiftMonth({ y: 2026, m: 1 }, -1)).toEqual({ y: 2025, m: 12 })
    expect(shiftMonth({ y: 2026, m: 12 }, 1)).toEqual({ y: 2027, m: 1 })
    expect(shiftMonth({ y: 2026, m: 9 }, 8)).toEqual({ y: 2027, m: 5 })
    expect(ymKey({ y: 99, m: 3 })).toBe('0099-03')
    expect(ymOfDate('2026-09-14')).toBe('2026-09')
  })
})
