// V2 Iter2 首页的纯账（H5：CalendarView 拆出的逻辑）——墨点分档、摘录截断、
// 今日面三态、时间账文句、「翻到」年轮。全纯函数，DOM 组件只消费这里的判定。
import type { DayMark, HomeDigest, JournalStats } from '../application'
import { shortDateLabel } from './labels'

export interface Ym {
  readonly y: number
  readonly m: number
}

export function shiftMonth({ y, m }: Ym, delta: number): Ym {
  const idx = y * 12 + (m - 1) + delta
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 }
}

export function ymKey({ y, m }: Ym): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`
}

export function ymOfDate(date: string): string {
  return date.slice(0, 7)
}

// —— H3 墨点信息量：1 / 2-4 / 5+ 张 → s/m/l（3/4.5/6px · alpha .5/.7/.9 住 CSS 令牌）——
export type DotTier = 's' | 'm' | 'l'

export function dotTier(count: number): DotTier | null {
  if (count >= 5) return 'l'
  if (count >= 2) return 'm'
  if (count >= 1) return 's'
  return null
}

export interface CellInk {
  readonly tier: DotTier | null
  readonly fold: boolean
}

/** 一格墨账：点档 + 贴过照片的折角旗（哪天贴过照，一眼读得出）。 */
export function inkOf(count: number, hasImage: boolean): CellInk {
  return { tier: dotTier(count), fold: hasImage }
}

const EXCERPT_MAX = 24

/** 摘录上纸：首行已剥，这里只裁 ~24 字配省略号。 */
export function clipExcerpt(text: string): string {
  return text.length > EXCERPT_MAX ? `${text.slice(0, EXCERPT_MAX)}…` : text
}

// —— H1 今日面（书脊三态，不是仪表盘卡）——
export type BandView =
  | { readonly state: 'paper'; readonly count: number; readonly excerpt: string | null }
  | { readonly state: 'quiet'; readonly recentDate: string; readonly recentLabel: string; readonly excerpt: string | null }
  | { readonly state: 'fresh' }

export function bandView(home: HomeDigest, today: string): BandView {
  if (home.stats.totalDays === 0) return { state: 'fresh' }
  if (home.today.count > 0) {
    return {
      state: 'paper',
      count: home.today.count,
      excerpt: home.today.excerpt === null ? null : clipExcerpt(home.today.excerpt.text),
    }
  }
  const recent = home.recent
  if (recent === null) return { state: 'fresh' }
  return {
    state: 'quiet',
    recentDate: recent.date,
    recentLabel: shortDateLabel(recent.date),
    excerpt: recent.excerpt === null ? null : clipExcerpt(recent.excerpt.text),
  }
}

// —— H2 时间账（跨月连续是数字，不是装饰）——
export const FRESH_WHISPER = '翻开即今日，落笔即永远。'

export function journalFoot(
  stats: JournalStats,
  days: readonly DayMark[],
  viewingYm: string,
  todayYm: string,
): string {
  if (stats.lastDate === null) return FRESH_WHISPER
  const base = `此册已记 ${String(stats.totalDays)} 日 · 最近 ${shortDateLabel(stats.lastDate)}`
  if (viewingYm === todayYm) return base
  const monthDays = days.reduce((n, d) => (ymOfDate(d.date) === viewingYm ? n + 1 : n), 0)
  return `${base} · 该月 ${String(monthDays)} 日`
}

// —— H4 「翻到」：整年有纸的月份旗（一次读的 days 底料派生，绝不再扫库）——
export function yearMonthFlags(days: readonly DayMark[], y: number): readonly boolean[] {
  const flags: boolean[] = Array.from({ length: 12 }, () => false)
  const prefix = `${String(y).padStart(4, '0')}-`
  for (const d of days) {
    if (d.date.startsWith(prefix)) flags[Number(d.date.slice(5, 7)) - 1] = true
  }
  return flags
}
