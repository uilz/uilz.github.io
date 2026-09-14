import { weekdayMondayIndex } from '../domain/date'

export const WEEKDAYS_MONDAY = ['一', '二', '三', '四', '五', '六', '日']

/** 「2026年9月4日 · 周四」——日手札页眉的题字。 */
export function dateTitle(date: string): string {
  const y = date.slice(0, 4)
  const m = String(Number(date.slice(5, 7)))
  const d = String(Number(date.slice(8, 10)))
  const w = WEEKDAYS_MONDAY[weekdayMondayIndex(date)]
  return `${y}年${m}月${d}日 · 周${w ?? ''}`
}

/** 「9月4日」——串珠子与近日纸单里的小日期签。 */
export function shortDateLabel(date: string): string {
  return `${String(Number(date.slice(5, 7)))}月${String(Number(date.slice(8, 10)))}日`
}

/** 窄屏页眉的紧凑日期零件：md 恒在；year 只在跨年时现身（同年drop年，V2-F1）；weekday 是「· 周日」尾巴。 */
export interface DateParts {
  readonly year: string | null
  readonly md: string
  readonly weekday: string
}

export function dateParts(date: string, today: string): DateParts {
  const y = date.slice(0, 4)
  const md = shortDateLabel(date)
  const weekday = `· 周${WEEKDAYS_MONDAY[weekdayMondayIndex(date)] ?? ''}`
  return { year: y === today.slice(0, 4) ? null : `${y}年`, md, weekday }
}

